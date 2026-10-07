/**
 * DB-free tests for directed putaway by receipt type: link moves the type in
 * one transaction with one event, re-link is a no-op, bad labels write
 * nothing, unlink clears, and the pre-migration column (42703) fails soft.
 */

process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PUTAWAY_KIND_LINKED_EVENT,
  PUTAWAY_KIND_UNLINKED_EVENT,
  linkPutawayTarget,
  readPutawayTargets,
  unlinkPutawayTarget,
  type PutawayTargetsDeps,
} from './putaway-targets';
import type { LocationCandidate } from './arrival-package';
import type { RecordOpsEventInput } from '@/lib/ops-events';

const ORG = '00000000-0000-0000-0000-000000000001';

interface Row {
  id: number;
  code: string;
  face: string;
  putaway_intake_kind: string | null;
  is_active: boolean;
}

interface Captured {
  transactions: number;
  queries: Array<{ sql: string; params: unknown[] }>;
  events: RecordOpsEventInput[];
  readOrgs: string[];
}

const undefinedColumn = Object.assign(new Error('column "putaway_intake_kind" does not exist'), {
  code: '42703',
});

/** A tiny in-memory `locations` that the fake client's UPDATEs actually mutate. */
function fakes(opts: { rows?: Row[]; candidates?: LocationCandidate[]; missingColumn?: boolean } = {}) {
  const rows = (opts.rows ?? []).map((r) => ({ ...r }));
  const cap: Captured = { transactions: 0, queries: [], events: [], readOrgs: [] };
  const client = {
    query: async (sql: string, params: unknown[]) => {
      cap.queries.push({ sql, params });
      if (opts.missingColumn) throw undefinedColumn;
      const [, kind, id] = params as [string, string, number | null];
      if (/FOR UPDATE/.test(sql)) {
        return { rows: rows.filter((r) => r.putaway_intake_kind === kind || r.id === id) };
      }
      if (/SET putaway_intake_kind = NULL/.test(sql)) {
        for (const r of rows) if (r.putaway_intake_kind === kind) r.putaway_intake_kind = null;
        return { rows: [] };
      }
      if (/SET putaway_intake_kind = \$2/.test(sql)) {
        for (const r of rows) if (r.id === id) r.putaway_intake_kind = kind;
        return { rows: [] };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
  const deps: PutawayTargetsDeps = {
    queryTargetRows: async (orgId) => {
      cap.readOrgs.push(orgId);
      if (opts.missingColumn) throw undefinedColumn;
      return rows
        .filter((r) => r.is_active && r.putaway_intake_kind)
        .map((r) => ({ kind: r.putaway_intake_kind as string, id: r.id, code: r.code, face: r.face }));
    },
    readLocationCandidates: async () => opts.candidates ?? [],
    transact: async (orgId, fn) => {
      assert.equal(orgId, ORG);
      cap.transactions += 1;
      return fn(client as never);
    },
    recordEvent: async (_client, input) => {
      cap.events.push(input);
      return 77;
    },
  };
  return { deps, cap, rows };
}

const RK12_3: Row = { id: 12, code: 'RK12-3', face: 'RK12-3', putaway_intake_kind: null, is_active: true };
const RK07_1: Row = { id: 7, code: 'RK07-1', face: 'Returns shelf', putaway_intake_kind: 'RETURN', is_active: true };
const candidate = (r: Row): LocationCandidate => ({ id: r.id, barcode: r.code, face: r.face, isActive: r.is_active });

const writes = (cap: Captured) => cap.queries.filter((q) => /^UPDATE/.test(q.sql));

test('readPutawayTargets: maps active holders; inactive holders read as null', async () => {
  const inactive: Row = { id: 3, code: 'RK03', face: 'RK03', putaway_intake_kind: 'PO', is_active: false };
  const { deps, cap } = fakes({ rows: [RK07_1, inactive] });
  const targets = await readPutawayTargets(ORG, deps);
  assert.deepEqual(targets, {
    PO: null,
    RETURN: { locationId: 7, code: 'RK07-1', face: 'Returns shelf' },
    TRADE_IN: null,
  });
  assert.deepEqual(cap.readOrgs, [ORG]);
});

test('linkPutawayTarget: moves the type off its previous holder in one tx with one event', async () => {
  const { deps, cap, rows } = fakes({ rows: [RK07_1, RK12_3], candidates: [candidate(RK12_3)] });
  const out = await linkPutawayTarget(
    ORG,
    { kind: 'RETURN', scanned: ' rk12-3 ', staffId: 5, clientEventId: 'evt-1' },
    deps,
  );

  assert.equal(out.kind, 'linked');
  if (out.kind !== 'linked') return;
  assert.equal(out.changed, true);
  assert.deepEqual(out.previous, { locationId: 7, code: 'RK07-1', face: 'Returns shelf' });
  assert.equal(out.displacedKind, null);
  assert.deepEqual(out.targets.RETURN, { locationId: 12, code: 'RK12-3', face: 'RK12-3' });

  assert.equal(cap.transactions, 1);
  const w = writes(cap);
  assert.equal(w.length, 2);
  assert.match(w[0].sql, /SET putaway_intake_kind = NULL/);
  assert.deepEqual(w[0].params, [ORG, 'RETURN']);
  assert.deepEqual(w[1].params, [ORG, 'RETURN', 12]);
  assert.equal(rows.find((r) => r.id === 7)?.putaway_intake_kind, null);

  assert.equal(cap.events.length, 1);
  assert.deepEqual(cap.events[0], {
    organizationId: ORG,
    entityType: 'location',
    entityId: 12,
    eventType: PUTAWAY_KIND_LINKED_EVENT,
    actorStaffId: 5,
    clientEventId: 'putaway-kind:evt-1',
    payload: { kind: 'RETURN', locationId: 12, code: 'RK12-3', previousLocationId: 7, displacedKind: null },
  });
});

test('linkPutawayTarget: a location carrying another type gives it up (displacedKind)', async () => {
  const holdsPo: Row = { ...RK12_3, putaway_intake_kind: 'PO' };
  const { deps, cap } = fakes({ rows: [holdsPo], candidates: [candidate(holdsPo)] });
  const out = await linkPutawayTarget(ORG, { kind: 'TRADE_IN', scanned: 'RK12-3', staffId: 5, clientEventId: 'e' }, deps);
  assert.equal(out.kind, 'linked');
  if (out.kind !== 'linked') return;
  assert.equal(out.previous, null);
  assert.equal(out.displacedKind, 'PO');
  assert.equal(out.targets.PO, null);
  assert.equal(out.targets.TRADE_IN?.locationId, 12);
  assert.equal(writes(cap).length, 1, 'no holder → only the SET');
});

test('linkPutawayTarget: re-linking the current holder writes nothing and records no event', async () => {
  const { deps, cap } = fakes({ rows: [RK07_1], candidates: [candidate(RK07_1)] });
  const out = await linkPutawayTarget(ORG, { kind: 'RETURN', scanned: 'RK07-1', staffId: 5, clientEventId: 'e' }, deps);
  assert.equal(out.kind, 'linked');
  if (out.kind !== 'linked') return;
  assert.equal(out.changed, false);
  assert.equal(out.previous?.locationId, 7);
  assert.equal(writes(cap).length, 0);
  assert.equal(cap.events.length, 0);
});

test('linkPutawayTarget: unknown label → error, no tx, no event', async () => {
  const { deps, cap } = fakes({ rows: [RK07_1] });
  const out = await linkPutawayTarget(ORG, { kind: 'PO', scanned: 'RK99-9', staffId: 5, clientEventId: 'e' }, deps);
  assert.deepEqual(out, { kind: 'unknown_location', error: 'No location has the label RK99-9' });
  assert.equal(cap.transactions, 0);
  assert.equal(cap.events.length, 0);
});

test('linkPutawayTarget: inactive label → error, no tx, no event', async () => {
  const off: Row = { ...RK12_3, is_active: false };
  const { deps, cap } = fakes({ rows: [off], candidates: [candidate(off)] });
  const out = await linkPutawayTarget(ORG, { kind: 'PO', scanned: 'RK12-3', staffId: 5, clientEventId: 'e' }, deps);
  assert.deepEqual(out, { kind: 'inactive_location', error: 'RK12-3 is not an active location' });
  assert.equal(cap.transactions, 0);
  assert.equal(cap.events.length, 0);
});

test('unlinkPutawayTarget: clears the holder and records one event', async () => {
  const { deps, cap } = fakes({ rows: [RK07_1] });
  const out = await unlinkPutawayTarget(ORG, { kind: 'RETURN', staffId: 5, clientEventId: 'u-1' }, deps);
  assert.equal(out.kind, 'unlinked');
  if (out.kind !== 'unlinked') return;
  assert.deepEqual(out.previous, { locationId: 7, code: 'RK07-1', face: 'Returns shelf' });
  assert.equal(out.targets.RETURN, null);
  assert.equal(cap.transactions, 1);
  assert.deepEqual(writes(cap).map((q) => q.params), [[ORG, 'RETURN']]);
  assert.equal(cap.events.length, 1);
  assert.equal(cap.events[0].eventType, PUTAWAY_KIND_UNLINKED_EVENT);
  assert.equal(cap.events[0].entityId, 7);
  assert.equal(cap.events[0].clientEventId, 'putaway-kind:u-1');
});

test('unlinkPutawayTarget: nothing linked → no writes, no event', async () => {
  const { deps, cap } = fakes({ rows: [RK12_3] });
  const out = await unlinkPutawayTarget(ORG, { kind: 'PO', staffId: 5, clientEventId: 'u' }, deps);
  assert.deepEqual(out, { kind: 'unlinked', targets: { PO: null, RETURN: null, TRADE_IN: null }, previous: null });
  assert.equal(writes(cap).length, 0);
  assert.equal(cap.events.length, 0);
});

test('42703 (migration not applied): read is all-null; link and unlink are not_ready', async () => {
  const { deps, cap } = fakes({ rows: [RK12_3], candidates: [candidate(RK12_3)], missingColumn: true });
  assert.deepEqual(await readPutawayTargets(ORG, deps), { PO: null, RETURN: null, TRADE_IN: null });

  const linked = await linkPutawayTarget(ORG, { kind: 'PO', scanned: 'RK12-3', staffId: 5, clientEventId: 'e' }, deps);
  assert.equal(linked.kind, 'not_ready');
  assert.ok('error' in linked);
  assert.match(linked.error, /2026-10-07_locations_putaway_intake_kind\.sql/);

  const unlinked = await unlinkPutawayTarget(ORG, { kind: 'PO', staffId: 5, clientEventId: 'u' }, deps);
  assert.equal(unlinked.kind, 'not_ready');
  assert.equal(cap.events.length, 0);
});
