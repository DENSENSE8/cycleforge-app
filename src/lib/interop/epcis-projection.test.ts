/**
 * DB-free unit test for the EPCIS projection.
 *
 * `projectEpcisPage` takes its read surface as an injected dep, so this runs
 * against a captured fake with zero Postgres — the house `Deps`-injection
 * pattern (`.claude/rules/backend-patterns.md`).
 *
 * Run: `node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        --test src/lib/interop/epcis-projection.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeEpcisCursor,
  encodeEpcisCursor,
  epcListFor,
  projectEpcisPage,
  projectEvent,
  type EpcisEvent,
  type EpcisProjectionDeps,
  type EpcisProjectionResult,
  type EpcisSourceRow,
} from './epcis-projection';

const BASE: EpcisSourceRow = {
  id: 1,
  occurred_at: new Date('2026-07-15T18:30:00.000Z'),
  event_type: 'RECEIVED',
  station: 'RECEIVING',
  actor_staff_id: 7,
  receiving_id: 500,
  receiving_line_id: 900,
  serial_unit_id: 42,
  sku: 'ABC-123',
  bin_id: 12,
  prev_bin_id: null,
  prev_status: null,
  next_status: 'RECEIVED',
  client_event_id: '5f0c2b1a-0000-4000-8000-000000000001',
  serial_number: 'SN-4471',
  gtin: '00812345000019',
  po_number: 'PO-2026-88',
};

const row = (over: Partial<EpcisSourceRow> = {}): EpcisSourceRow => ({ ...BASE, ...over });

/** Fake read surface that captures what the projection asked for. */
function fakeDeps(rows: EpcisSourceRow[]) {
  const calls: Array<{ orgId: string; since: string | null; limit: number }> = [];
  const deps: EpcisProjectionDeps = {
    fetchEvents: async (args) => {
      calls.push({ orgId: args.orgId, since: args.since, limit: args.limit });
      return rows;
    },
  };
  return { calls, deps };
}

test('a mapped event projects with both CBV terms in the requested URI form', () => {
  const urn: EpcisEvent | null = projectEvent(row(), { identity: {}, form: 'urn' });
  assert.ok(urn);
  assert.equal(urn.type, 'ObjectEvent');
  assert.equal(urn.bizStep, 'urn:epcglobal:cbv:bizstep:receiving');
  assert.equal(urn.disposition, 'urn:epcglobal:cbv:disp:in_progress');
  assert.equal(urn.action, 'ADD');

  const web = projectEvent(row(), { identity: {}, form: 'webUri' });
  assert.ok(web);
  assert.equal(web.bizStep, 'https://ref.gs1.org/cbv/BizStep-receiving');
  assert.equal(web.disposition, 'https://ref.gs1.org/cbv/Disp-in_progress');
});

test('eventTime is the server instant and carries the warehouse zone offset', () => {
  // 2026-07-15 is inside US Pacific daylight time → -07:00.
  const summer = projectEvent(row(), { identity: {}, form: 'urn' });
  assert.ok(summer);
  assert.equal(summer.eventTime, '2026-07-15T18:30:00.000Z');
  assert.equal(summer.eventTimeZoneOffset, '-07:00');

  // …and January is standard time → -08:00. A hardcoded offset would be wrong
  // for half the year, which is why this is resolved through Intl.
  const winter = projectEvent(
    row({ occurred_at: new Date('2026-01-15T18:30:00.000Z') }),
    { identity: {}, form: 'urn' },
  );
  assert.ok(winter);
  assert.equal(winter.eventTimeZoneOffset, '-08:00');
});

test('an unmappable event type is not projected', () => {
  assert.equal(projectEvent(row({ event_type: 'LISTED' }), { identity: {}, form: 'urn' }), null);
  assert.equal(projectEvent(row({ event_type: 'NOTE' }), { identity: {}, form: 'urn' }), null);
  // An event type that is not in the vocabulary at all is also declined, not
  // guessed at.
  assert.equal(projectEvent(row({ event_type: 'WAT' }), { identity: {}, form: 'urn' }), null);
});

test('epcList prefers SGTIN, falls back to an internal handle, never invents', () => {
  assert.deepEqual(epcListFor(row()), ['urn:epc:id:sgtin:00812345000019.SN-4471']);

  // No GTIN (the unit has no sku_catalog_id) → internal unit handle only.
  assert.deepEqual(epcListFor(row({ gtin: null })), ['urn:cycleforge:unit:42']);

  // No serial → class-level GTIN alongside the internal handle.
  assert.deepEqual(epcListFor(row({ serial_number: null })), [
    'urn:cycleforge:unit:42',
    'https://id.gs1.org/01/00812345000019',
  ]);

  // A carton-scoped event with no unit at all — real for an arrival scan.
  assert.deepEqual(
    epcListFor(row({ serial_unit_id: null, gtin: null, serial_number: null })),
    ['urn:cycleforge:line:900'],
  );
  assert.deepEqual(
    epcListFor(
      row({ serial_unit_id: null, receiving_line_id: null, gtin: null, serial_number: null }),
    ),
    ['urn:cycleforge:carton:500'],
  );
});

test('bizLocation appears only with a real GLN, and never from the placeholder', () => {
  const none = projectEvent(row(), { identity: {}, form: 'urn' });
  assert.ok(none);
  assert.equal(none.bizLocation, undefined, 'no GLN configured → omit `where` entirely');

  // The repo's DEFAULT_GLN. Must NOT produce a bizLocation.
  const placeholder = projectEvent(row(), {
    identity: { gln: '0614141000005' },
    form: 'urn',
  });
  assert.ok(placeholder);
  assert.equal(placeholder.bizLocation, undefined);

  const real = projectEvent(row(), { identity: { gln: '0812345000009' }, form: 'urn' });
  assert.ok(real);
  assert.deepEqual(real.bizLocation, { id: 'urn:epc:id:sgln:0812345000009' });
});

test('readPoint is always internal and never masquerades as a GLN', () => {
  const withBin = projectEvent(row(), { identity: {}, form: 'urn' });
  assert.ok(withBin);
  assert.deepEqual(withBin.readPoint, { id: 'urn:cycleforge:location:12' });
  assert.ok(!withBin.readPoint.id.startsWith('urn:epc:'));

  const noBin = projectEvent(row({ bin_id: null }), { identity: {}, form: 'urn' });
  assert.ok(noBin);
  assert.deepEqual(noBin.readPoint, { id: 'urn:cycleforge:location:station%3ARECEIVING' });

  const nothing = projectEvent(row({ bin_id: null, station: null }), { identity: {}, form: 'urn' });
  assert.ok(nothing);
  assert.equal(nothing.readPoint, undefined);
});

test('a PO rides in the why dimension of the ObjectEvent, not a TransactionEvent', () => {
  const e = projectEvent(row(), { identity: {}, form: 'urn' });
  assert.ok(e);
  assert.equal(e.type, 'ObjectEvent', 'GS1: prefer bizTransactionList over a bare TransactionEvent');
  assert.deepEqual(e.bizTransactionList, [
    { type: 'urn:epcglobal:cbv:btt:po', bizTransaction: 'urn:cycleforge:order:PO-2026-88' },
  ]);

  const noPo = projectEvent(row({ po_number: null }), { identity: {}, form: 'urn' });
  assert.ok(noPo);
  assert.equal(noPo.bizTransactionList, undefined, 'absent, not empty');
});

test('eventID reuses the idempotency key so a replay dedupes the same way the write did', () => {
  const e = projectEvent(row(), { identity: {}, form: 'urn' });
  assert.ok(e);
  assert.equal(e.eventID, 'urn:uuid:5f0c2b1a-0000-4000-8000-000000000001');

  const noKey = projectEvent(row({ client_event_id: null }), { identity: {}, form: 'urn' });
  assert.ok(noKey);
  assert.equal(noKey.eventID, 'urn:cycleforge:unit:event-1');
});

test('the cursor round-trips and a malformed one restarts rather than throwing', () => {
  const c = { occurredAt: '2026-07-15T18:30:00.000Z', id: 99 };
  assert.deepEqual(decodeEpcisCursor(encodeEpcisCursor(c)), c);
  assert.equal(decodeEpcisCursor('not-a-cursor'), null);
  assert.equal(decodeEpcisCursor(''), null);
  assert.equal(decodeEpcisCursor(null), null);
});

test('paging fetches one extra row and does not emit it', async () => {
  const rows = [row({ id: 1 }), row({ id: 2 }), row({ id: 3 })];
  const { deps, calls } = fakeDeps(rows);

  const res = await projectEpcisPage({ orgId: 'org-1', identity: {}, limit: 2 }, deps);

  assert.equal(calls[0]?.limit, 3, 'asks for limit+1 to detect a next page without a COUNT');
  assert.equal(res.events.length, 2, 'the probe row is not emitted');
  assert.ok(res.nextCursor, 'a next page exists');
  assert.deepEqual(decodeEpcisCursor(res.nextCursor)?.id, 2, 'cursor points at the last EMITTED row');
});

test('the last page reports no cursor', async () => {
  const { deps } = fakeDeps([row({ id: 1 })]);
  const res = await projectEpcisPage({ orgId: 'org-1', identity: {}, limit: 10 }, deps);
  assert.equal(res.events.length, 1);
  assert.equal(res.nextCursor, null);
});

test('skipped event types are counted, never silently dropped', async () => {
  const { deps } = fakeDeps([
    row({ id: 1, event_type: 'RECEIVED' }),
    row({ id: 2, event_type: 'LISTED' }),
    row({ id: 3, event_type: 'LISTED' }),
    row({ id: 4, event_type: 'NOTE' }),
  ]);

  const res = await projectEpcisPage({ orgId: 'org-1', identity: {}, limit: 50 }, deps);

  assert.equal(res.events.length, 1);
  // A consumer seeing this knows exactly what it is NOT being told, which is
  // the difference between a documented gap and a misleading feed.
  assert.deepEqual(res.meta.skipped, { LISTED: 2, NOTE: 1 });
});

test('the cursor advances past skipped rows so the tail cannot replay forever', async () => {
  // The whole page is unmappable. If the cursor were derived from the last
  // EMITTED event there would be none, the cursor would not advance, and the
  // consumer would request the same page indefinitely.
  const { deps } = fakeDeps([
    row({ id: 10, event_type: 'LISTED' }),
    row({ id: 11, event_type: 'NOTE' }),
    row({ id: 12, event_type: 'LISTED' }),
  ]);

  const res = await projectEpcisPage({ orgId: 'org-1', identity: {}, limit: 2 }, deps);

  assert.equal(res.events.length, 0);
  assert.ok(res.nextCursor, 'must still advance');
  assert.equal(decodeEpcisCursor(res.nextCursor)?.id, 11);
});

test('limit is clamped and the org is threaded into the read', async () => {
  const { deps, calls } = fakeDeps([]);
  await projectEpcisPage({ orgId: 'org-9', identity: {}, limit: 99_999 }, deps);
  assert.equal(calls[0]?.limit, 1001, 'clamped to EPCIS_PAGE_MAX (+1 probe)');
  assert.equal(calls[0]?.orgId, 'org-9');

  const { deps: d2, calls: c2 } = fakeDeps([]);
  await projectEpcisPage({ orgId: 'org-9', identity: {}, limit: -5 }, d2);
  assert.equal(c2[0]?.limit, 2, 'a nonsense limit floors at 1 (+1 probe)');
});

test('meta reports the URI form and whether a bizLocation is available', async () => {
  const { deps } = fakeDeps([row()]);
  const res: EpcisProjectionResult = await projectEpcisPage(
    { orgId: 'org-1', identity: { gln: '0812345000009', cbvUriForm: 'webUri' }, limit: 10 },
    deps,
  );
  assert.equal(res.meta.cbvUriForm, 'webUri');
  assert.equal(res.meta.hasBizLocation, true);
  assert.equal(res.events[0]?.bizStep, 'https://ref.gs1.org/cbv/BizStep-receiving');
});
