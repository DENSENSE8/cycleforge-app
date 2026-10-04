/** DB-free tests for the placement verbs: suggest stamps the tier, confirm refuses a mismatch without writing. */

process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARRIVAL_PLACED_EVENT,
  confirmPlacement,
  normalizeShelfCode,
  suggestPlacement,
  type ArrivalPlacementDeps,
  type CartonArrivalFacts,
} from './arrival-shelves';
import type { ArrivalShelf } from './arrival-shelf-plan';
import type { RecordOpsEventInput } from '@/lib/ops-events';

const ORG = '00000000-0000-0000-0000-000000000001';

function facts(partial: Partial<CartonArrivalFacts> = {}): CartonArrivalFacts {
  return {
    receivingId: 41,
    cartonTier: null,
    isPriority: false,
    isReturn: false,
    sourcePlatform: 'goodwill',
    stagingLocationId: null,
    skus: ['SKU-1'],
    inboundOrderTiers: [],
    hasOpenClaim: false,
    ...partial,
  };
}

const SHELVES: ArrivalShelf[] = [
  { id: 10, barcode: 'A0101101', face: 'A-01-01-1-01', tier: 0, capacity: null, occupied: 0, sortOrder: 0 },
  { id: 13, barcode: 'A0101401', face: 'A-01-01-4-01', tier: 3, capacity: null, occupied: 0, sortOrder: 3 },
];

function makeDeps(opts: { facts?: CartonArrivalFacts | null; shelves?: ArrivalShelf[]; pending?: string[] } = {}) {
  const queries: Array<{ text: string; params: unknown[] }> = [];
  const events: RecordOpsEventInput[] = [];
  const deps: ArrivalPlacementDeps = {
    readFacts: async () => (opts.facts === undefined ? facts() : opts.facts),
    readShelves: async () => ({ shelves: opts.shelves ?? SHELVES }),
    pendingOrderSkus: async () => opts.pending ?? [],
    transact: async (_org, fn) =>
      fn({
        query: (async (text: string, params: unknown[]) => {
          queries.push({ text, params });
          return { rows: [], rowCount: 1 };
        }) as never,
      }),
    recordEvent: async (input) => {
      events.push(input);
      return 99;
    },
  };
  return { deps, queries, events };
}

test('suggest: a Goodwill carton with no tier is shelved Low; a derived default is NOT stamped (stays Auto)', async () => {
  const { deps, queries } = makeDeps();
  const r = await suggestPlacement(ORG, 41, deps);
  assert.equal(r.kind, 'suggested');
  if (r.kind !== 'suggested') return;
  assert.deepEqual(r.tier, { tier: 3, source: 'platform' });
  assert.equal(r.suggestion.kind === 'shelf' && r.suggestion.shelf.id, 13);
  assert.equal(r.tierStamped, false);
  assert.equal(queries.length, 0);
});

test('suggest: the inbound order tier is copied onto a carton that has none', async () => {
  const { deps, queries } = makeDeps({ facts: facts({ inboundOrderTiers: [3] }) });
  const r = await suggestPlacement(ORG, 41, deps);
  assert.equal(r.kind === 'suggested' && r.tierStamped, true);
  assert.deepEqual(r.kind === 'suggested' && r.tier, { tier: 3, source: 'inbound_order' });
  assert.equal(queries.length, 1);
  assert.match(queries[0].text, /SET priority_tier = \$3[\s\S]*priority_tier IS NULL/);
  assert.deepEqual(queries[0].params, [41, ORG, 3]);
});

test('suggest: stock-out demand puts the carton on the Priority shelf', async () => {
  const { deps } = makeDeps({ pending: ['SKU-1'] });
  const r = await suggestPlacement(ORG, 41, deps);
  assert.equal(r.kind === 'suggested' && r.suggestion.kind === 'shelf' && r.suggestion.shelf.id, 10);
});

test('suggest: an explicit carton tier is never overwritten', async () => {
  const { deps, queries } = makeDeps({ facts: facts({ cartonTier: 0 }) });
  const r = await suggestPlacement(ORG, 41, deps);
  assert.equal(r.kind === 'suggested' && r.tierStamped, false);
  assert.equal(queries.length, 0);
});

test('suggest: no tiered shelves → no_shelves (the honest "none configured" state)', async () => {
  const { deps } = makeDeps({ shelves: [] });
  const r = await suggestPlacement(ORG, 41, deps);
  assert.equal(r.kind === 'suggested' && r.suggestion.kind, 'no_shelves');
});

test('confirm: scanning the wrong-tier shelf is refused and nothing is written', async () => {
  const { deps, queries, events } = makeDeps();
  const r = await confirmPlacement(
    ORG,
    { receivingId: 41, scanned: 'A-01-01-1-01', staffId: 3, phoneOrigin: true, clientEventId: 'c1', mobileScanEventId: null, surface: null },
    deps,
  );
  assert.equal(r.kind, 'refused');
  assert.equal(r.kind === 'refused' && r.verdict.reason, 'wrong_tier');
  assert.equal(queries.length, 0);
  assert.equal(events.length, 0);
});

test('confirm: a label that is not an urgency shelf is refused', async () => {
  const { deps, queries } = makeDeps();
  const r = await confirmPlacement(
    ORG,
    { receivingId: 41, scanned: 'B0202201', staffId: 3, phoneOrigin: false, clientEventId: null, mobileScanEventId: null, surface: null },
    deps,
  );
  assert.equal(r.kind === 'refused' && r.verdict.reason, 'not_arrival_shelf');
  assert.equal(queries.length, 0);
});

test('confirm: the right shelf (dashed spelling) writes the staging shelf, stamps the order tier, logs a phone event', async () => {
  const { deps, queries, events } = makeDeps({ facts: facts({ inboundOrderTiers: [3] }) });
  const r = await confirmPlacement(
    ORG,
    { receivingId: 41, scanned: 'A-01-01-4-01', staffId: 3, phoneOrigin: true, clientEventId: 'c2', mobileScanEventId: 7, surface: '/m/r/41/place' },
    deps,
  );
  assert.equal(r.kind, 'placed');
  assert.equal(r.kind === 'placed' && r.shelf.id, 13);
  assert.ok(queries.some((q) => /receiving_triage/.test(q.text) && q.params.includes(13)));
  assert.ok(queries.some((q) => /SET priority_tier/.test(q.text)));
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, ARRIVAL_PLACED_EVENT);
  assert.equal(events[0].clientEventId, 'arrival-placed:c2');
  const payload = events[0].payload as { origin: string; locationId: number; mobile_scan_event_id: number };
  assert.equal(payload.origin, 'phone');
  assert.equal(payload.locationId, 13);
  assert.equal(payload.mobile_scan_event_id, 7);
});

test('confirm: a movable-rack shelf matches from any printed spelling and places the carton', async () => {
  const rackShelf: ArrivalShelf = { id: 21, barcode: 'RK12-3', face: 'RK12-3', tier: 3, capacity: null, occupied: 0, sortOrder: 0 };
  const { deps, queries } = makeDeps({ shelves: [rackShelf] });
  const r = await confirmPlacement(
    ORG,
    { receivingId: 41, scanned: '(414)0850012345671(254)rk0012-03', staffId: 3, phoneOrigin: true, clientEventId: 'c3', mobileScanEventId: null, surface: null },
    deps,
  );
  assert.equal(r.kind, 'placed');
  assert.equal(r.kind === 'placed' && r.shelf.id, 21);
  assert.ok(queries.some((q) => /receiving_triage/.test(q.text) && q.params.includes(21)));
});

test('confirm: unknown carton → not_found', async () => {
  const { deps } = makeDeps({ facts: null });
  const r = await confirmPlacement(
    ORG,
    { receivingId: 41, scanned: 'A0101401', staffId: 3, phoneOrigin: false, clientEventId: null, mobileScanEventId: null, surface: null },
    deps,
  );
  assert.equal(r.kind, 'not_found');
});

test('shelf codes compare across dashed and flat spellings', () => {
  assert.equal(normalizeShelfCode('a-01-01-1-01'), normalizeShelfCode('A0101101'));
  assert.equal(normalizeShelfCode(' receiving-1 '), 'RECEIVING-1');
});
