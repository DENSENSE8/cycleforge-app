/** DB-free coverage for inbound follow-ups: key canonicalization, schemas, and the store's upsert/clear SQL. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { inboundFollowupKey } from './inbound-followups';
import { readInboundFollowups, writeInboundFollowups, type InboundFollowupsDeps } from './inbound-followups-store';
import { InboundFollowupsQuery, InboundFollowupsWrite } from '@/lib/schemas/inbound-followups';

const ORG = '00000000-0000-4000-8000-000000000001';

function fakes(rowsFor: (sql: string) => unknown[] = () => []) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const orgs: string[] = [];
  const deps: InboundFollowupsDeps = {
    runTransaction: async (orgId, fn) => {
      orgs.push(orgId);
      return fn({
        query: (async (sql: string, params?: unknown[]) => {
          calls.push({ sql, params: params ?? [] });
          return { rows: rowsFor(sql) };
        }) as never,
      });
    },
  };
  return { deps, calls, orgs };
}

const ROW = {
  ref_key: 'PO12345',
  tag: 'need_claim',
  note: 'Signed for by: SANG',
  set_by: 7,
  set_by_name: 'Sang',
  set_at: new Date('2026-10-03T12:00:00.000Z'),
};

test('key: PO number wins over the pasted ref', () => {
  assert.equal(inboundFollowupKey({ poNumber: 'po-12345', ref: '1Z999AA10123456784' }), 'PO12345');
});

test('key: falls back to the ref when there is no PO (null, undefined, blank)', () => {
  for (const poNumber of [null, undefined, '', ' - ']) {
    assert.equal(inboundFollowupKey({ poNumber, ref: '1Z999AA10123456784' }), '1Z999AA10123456784');
  }
});

test('key: tracking and PO formatting variants map to one key', () => {
  const tracking = ['1Z 999 AA1 0123 4567 84', '1z999aa10123456784', ' 1Z-999-AA1-0123456784 '];
  assert.deepEqual(new Set(tracking.map((ref) => inboundFollowupKey({ ref }))), new Set(['1Z999AA10123456784']));
  const pos = ['PO-12345', 'po 12345', 'PO12345'];
  assert.deepEqual(new Set(pos.map((poNumber) => inboundFollowupKey({ poNumber, ref: 'x' }))), new Set(['PO12345']));
});

test('schemas: write requires 1..200 canonical keys, tag may be null, note max 500', () => {
  assert.ok(InboundFollowupsWrite.safeParse({ keys: ['PO1'], tag: null }).success);
  assert.ok(InboundFollowupsWrite.safeParse({ keys: ['PO1'], tag: 'double_check', note: 'ETA 10/5' }).success);
  assert.ok(!InboundFollowupsWrite.safeParse({ keys: [], tag: 'acknowledged' }).success);
  assert.ok(!InboundFollowupsWrite.safeParse({ keys: ['po-1'], tag: 'acknowledged' }).success);
  assert.ok(!InboundFollowupsWrite.safeParse({ keys: ['PO1'], tag: 'bogus' }).success);
  assert.ok(!InboundFollowupsWrite.safeParse({ keys: ['PO1'], tag: 'acknowledged', note: 'x'.repeat(501) }).success);
  assert.ok(!InboundFollowupsWrite.safeParse({ keys: Array.from({ length: 201 }, (_, i) => `K${i}`), tag: null }).success);
  assert.ok(InboundFollowupsQuery.safeParse({ keys: [] }).success);
  assert.ok(!InboundFollowupsQuery.safeParse({ keys: Array.from({ length: 201 }, (_, i) => `K${i}`) }).success);
});

test('read: no keys never opens a transaction', async () => {
  const { deps, orgs } = fakes();
  assert.deepEqual(await readInboundFollowups(ORG, [], deps), []);
  assert.equal(orgs.length, 0);
});

test('read: org-scoped, joins staff for the name, maps to the domain shape', async () => {
  const { deps, calls, orgs } = fakes(() => [ROW]);
  const out = await readInboundFollowups(ORG, ['PO12345'], deps);
  assert.deepEqual(orgs, [ORG]);
  assert.match(calls[0].sql, /LEFT JOIN staff s ON s\.id = f\.set_by/);
  assert.match(calls[0].sql, /f\.organization_id = \$1 AND f\.ref_key = ANY\(\$2::text\[\]\)/);
  assert.deepEqual(calls[0].params, [ORG, ['PO12345']]);
  assert.deepEqual(out, [
    { key: 'PO12345', tag: 'need_claim', note: 'Signed for by: SANG', setBy: 7, setByName: 'Sang', setAt: '2026-10-03T12:00:00.000Z' },
  ]);
});

test('write: a tag upserts every (deduped) key, stamps staff, trims note, returns the fresh rows', async () => {
  const { deps, calls, orgs } = fakes((sql) => (sql.includes('SELECT f.ref_key') ? [ROW] : []));
  const out = await writeInboundFollowups(ORG, 7, { keys: ['PO12345', 'PO12345', 'TRK1'], tag: 'need_claim', note: '  ETA 10/5 ' }, deps);
  assert.deepEqual(orgs, [ORG]);
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /INSERT INTO inbound_followups/);
  assert.match(calls[0].sql, /ON CONFLICT \(organization_id, ref_key\)\s+DO UPDATE SET tag = EXCLUDED\.tag/);
  assert.deepEqual(calls[0].params, [ORG, ['PO12345', 'TRK1'], 'need_claim', 'ETA 10/5', 7]);
  assert.deepEqual(calls[1].params, [ORG, ['PO12345', 'TRK1']]);
  assert.equal(out[0].key, 'PO12345');
});

test('write: blank note stores null', async () => {
  const { deps, calls } = fakes();
  await writeInboundFollowups(ORG, 7, { keys: ['PO1'], tag: 'acknowledged', note: '   ' }, deps);
  assert.equal(calls[0].params[3], null);
});

test('write: tag null clears (DELETE only, no upsert) and returns nothing', async () => {
  const { deps, calls } = fakes();
  const out = await writeInboundFollowups(ORG, 7, { keys: ['PO1', 'TRK1'], tag: null }, deps);
  assert.deepEqual(out, []);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /^DELETE FROM inbound_followups WHERE organization_id = \$1 AND ref_key = ANY/);
  assert.deepEqual(calls[0].params, [ORG, ['PO1', 'TRK1']]);
});
