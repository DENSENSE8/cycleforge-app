/**
 * DB-free tests for arrival pairing: any-location placement, urgency
 * precedence (operator > inbound order > derived > default), the urgency
 * write, and the unbox queue order.
 */

process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARRIVAL_PLACED_EVENT,
  orderUnboxQueue,
  placeArrivalPackage,
  readArrivalPackage,
  readUnboxQueue,
  setArrivalUrgency,
  type ArrivalPackageDeps,
  type LocationCandidate,
  type PackageFacts,
  type UnboxQueueRow,
} from './arrival-package';
import type { RecordOpsEventInput } from '@/lib/ops-events';

const ORG = '00000000-0000-0000-0000-000000000001';

function facts(partial: Partial<PackageFacts> = {}, urgency: Partial<PackageFacts['urgency']> = {}): PackageFacts {
  return {
    receivingId: 41,
    tracking: '1Z999AA10123456784',
    carrier: 'UPS',
    found: true,
    platform: 'ebay',
    orderNumber: 'PO-12',
    vendor: 'Seller',
    doorReceivedAt: '2026-10-03T10:00:00Z',
    location: null,
    lineCount: 1,
    skus: ['SKU-1'],
    ...partial,
    urgency: {
      cartonTier: null,
      orderTier: null,
      orderNumber: null,
      isPriority: false,
      isReturn: false,
      hasOpenClaim: false,
      sourcePlatform: 'ebay',
      ...urgency,
    },
  };
}

/** A rack shelf — identification only, it carries no urgency. */
const RACK_SHELF: LocationCandidate = { id: 13, barcode: 'RK1-2', face: 'Rack 1 Shelf 2', isActive: true };
const BIN: LocationCandidate = { id: 20, barcode: 'C0203200', face: 'C-02-03-2', isActive: true };
const RETIRED: LocationCandidate = { id: 21, barcode: 'D0105200', face: 'D-01-05-2-00', isActive: false };

interface FakeOpts {
  facts?: PackageFacts | null;
  locations?: LocationCandidate[];
  pending?: string[];
  cartonTier?: number | null;
}

function makeDeps(opts: FakeOpts = {}) {
  const queries: Array<{ text: string; params: unknown[] }> = [];
  const events: RecordOpsEventInput[] = [];
  const pendingCalls: string[][] = [];
  const deps: ArrivalPackageDeps = {
    readFacts: async () => (opts.facts === undefined ? facts() : opts.facts),
    readItems: async () => [{ lineId: 1, title: 'Shimano crankset', sku: 'SKU-1', quantity: 1, imageUrl: null }],
    pendingOrderSkus: async (_org, skus) => {
      pendingCalls.push(skus);
      return opts.pending ?? [];
    },
    readLocationCandidates: async () => opts.locations ?? [RACK_SHELF, BIN, RETIRED],
    transact: async (_org, fn) =>
      fn({
        query: (async (text: string, params: unknown[]) => {
          queries.push({ text, params });
          if (/SELECT priority_tier FROM receiving_carton/.test(text)) {
            return opts.cartonTier === undefined
              ? { rows: [], rowCount: 0 }
              : { rows: [{ priority_tier: opts.cartonTier }], rowCount: 1 };
          }
          return { rows: [], rowCount: 1 };
        }) as never,
      }),
    recordEvent: async (input) => {
      events.push(input);
      return 99;
    },
  };
  return { deps, queries, events, pendingCalls };
}

const PLACE = {
  receivingId: 41,
  staffId: 7,
  phoneOrigin: true,
  clientEventId: 'evt-12345678',
  surface: '/m/r/41/place',
};

// ─── Placement: any active location ──────────────────────────────────────────

test('place: an URGENT package goes on any rack shelf — a location never refuses on urgency', async () => {
  const { deps, queries, events } = makeDeps({ facts: facts({}, { cartonTier: 0 }) });
  const r = await placeArrivalPackage(ORG, { ...PLACE, scanned: 'rk1-2' }, deps);
  assert.equal(r.kind, 'placed');
  if (r.kind !== 'placed') return;
  assert.deepEqual(r.location, { id: 13, code: 'RK1-2', name: 'Rack 1 Shelf 2' });
  assert.equal(r.changed, true);
  assert.equal(queries.length, 1);
  assert.match(queries[0].text, /receiving_triage/);
  assert.ok(queries[0].params.includes(13), 'staging location written');
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, ARRIVAL_PLACED_EVENT);
  assert.equal(events[0].organizationId, ORG);
  assert.equal(events[0].clientEventId, 'arrival-placed:evt-12345678');
  const payload = events[0].payload as Record<string, unknown>;
  assert.equal('locationArrivalTier' in payload, false, 'a location carries no urgency');
  assert.equal(payload.urgent, true);
});

test('place: a plain bin is accepted, any spelling of its label', async () => {
  const { deps, queries } = makeDeps();
  const r = await placeArrivalPackage(ORG, { ...PLACE, scanned: 'C-02-03-2-00' }, deps);
  assert.equal(r.kind === 'placed' && r.location.id, 20);
  assert.ok(queries[0].params.includes(20));
});

test('place: an inactive location is refused in operator words, nothing written', async () => {
  const { deps, queries, events } = makeDeps();
  const r = await placeArrivalPackage(ORG, { ...PLACE, scanned: 'D0105200' }, deps);
  assert.deepEqual(r, { kind: 'inactive_location', error: 'D-01-05-2-00 is not an active location' });
  assert.equal(queries.length, 0);
  assert.equal(events.length, 0);
});

test('place: an unknown label is refused, nothing written', async () => {
  const { deps, queries, events } = makeDeps();
  const r = await placeArrivalPackage(ORG, { ...PLACE, scanned: 'ZZ-NOPE' }, deps);
  assert.deepEqual(r, { kind: 'unknown_location', error: 'No location has the label ZZ-NOPE' });
  assert.equal(queries.length, 0);
  assert.equal(events.length, 0);
});

test('place: re-scanning the location it already sits on writes nothing new', async () => {
  const { deps, queries } = makeDeps({ facts: facts({ location: { id: 20, code: 'C0203200', name: 'C-02-03-2' } }) });
  const r = await placeArrivalPackage(ORG, { ...PLACE, scanned: 'C0203200' }, deps);
  assert.equal(r.kind === 'placed' && r.changed, false);
  assert.equal(queries.length, 0);
});

test('place: unknown package → not_found before any location read', async () => {
  const { deps, queries } = makeDeps({ facts: null });
  assert.deepEqual(await placeArrivalPackage(ORG, { ...PLACE, scanned: 'RK1-2' }, deps), { kind: 'not_found' });
  assert.equal(queries.length, 0);
});

// ─── Urgency precedence ──────────────────────────────────────────────────────

async function urgencyFor(f: PackageFacts, pending: string[] = []) {
  const { deps } = makeDeps({ facts: f, pending });
  const pkg = await readArrivalPackage(ORG, 41, deps);
  assert.ok(pkg);
  return pkg.urgency;
}

test('urgency: operator beats an urgent order (hand-set Not urgent wins)', async () => {
  const u = await urgencyFor(facts({}, { cartonTier: 2, orderTier: 0, orderNumber: 'PO-9', isPriority: true }));
  assert.deepEqual(u, { urgent: false, tier: 2, source: 'operator', reason: 'Marked not urgent by hand' });
});

test('urgency: the inbound order beats derived facts', async () => {
  const u = await urgencyFor(facts({}, { orderTier: 3, orderNumber: 'PO-9', isReturn: true }), ['SKU-1']);
  assert.deepEqual(u, { urgent: false, tier: 3, source: 'inbound_order', reason: 'Order PO-9 is Low' });
});

test('urgency: a waiting order for an item in it is derived Urgent', async () => {
  const u = await urgencyFor(facts(), ['SKU-1']);
  assert.deepEqual(u, { urgent: true, tier: 0, source: 'derived', reason: 'A waiting order needs an item in it' });
});

test('urgency: a platform default is derived', async () => {
  const u = await urgencyFor(facts({ platform: 'goodwill' }, { sourcePlatform: 'goodwill' }));
  assert.equal(u.source, 'derived');
  assert.equal(u.urgent, false);
  assert.equal(u.tier, 3);
});

test('urgency: nothing speaks → default Not urgent (tier 2)', async () => {
  const u = await urgencyFor(facts());
  assert.deepEqual(u, { urgent: false, tier: 2, source: 'default', reason: 'Nothing marks it urgent' });
});

test('package: current location is reported; there is no location suggestion', async () => {
  const { deps } = makeDeps({
    facts: facts({ location: { id: 20, code: 'C0203200', name: 'C-02-03-2' } }),
  });
  const pkg = await readArrivalPackage(ORG, 41, deps);
  assert.deepEqual(Object.keys(pkg ?? {}).sort(), [
    'carrier', 'doorReceivedAt', 'found', 'items', 'location', 'orderNumber',
    'platform', 'platformLabel', 'receivingId', 'tracking', 'urgency', 'vendor',
  ]);
  assert.deepEqual(pkg?.location, { id: 20, code: 'C0203200', name: 'C-02-03-2' });
  assert.equal(pkg?.platformLabel, 'eBay');
});

// ─── Urgency write ───────────────────────────────────────────────────────────

test('urgency write: Urgent 0, Not urgent 2, clear NULL; a replay writes nothing', async () => {
  for (const [urgent, tier] of [[true, 0], [false, 2], [null, null]] as const) {
    const { deps, queries } = makeDeps({ cartonTier: 3 });
    const r = await setArrivalUrgency(ORG, { receivingId: 41, urgent }, deps);
    assert.deepEqual(r, { kind: 'set', before: 3, after: tier, changed: true });
    assert.match(queries[1].text, /UPDATE receiving_carton[\s\S]*priority_tier = \$3/);
    assert.deepEqual(queries[1].params, [41, ORG, tier]);
  }
  const { deps, queries } = makeDeps({ cartonTier: 0 });
  assert.deepEqual(await setArrivalUrgency(ORG, { receivingId: 41, urgent: true }, deps), {
    kind: 'set',
    before: 0,
    after: 0,
    changed: false,
  });
  assert.equal(queries.length, 1);
});

test('urgency write: unknown package → not_found', async () => {
  const { deps } = makeDeps();
  assert.deepEqual(await setArrivalUrgency(ORG, { receivingId: 41, urgent: true }, deps), { kind: 'not_found' });
});

// ─── Unbox queue ─────────────────────────────────────────────────────────────

function queueRow(id: number, door: string, partial: Partial<UnboxQueueRow> = {}): UnboxQueueRow {
  return {
    receiving_id: id,
    priority_tier: null,
    is_priority: false,
    is_return: false,
    intake_type: null,
    source_platform: 'ebay',
    zoho_purchaseorder_number: null,
    carrier: null,
    tracking: `TRK${id}`,
    door_received_at: door,
    location_id: null,
    location_code: null,
    location_name: null,
    line_count: 1,
    skus: [`SKU-${id}`],
    order_tier: null,
    urgent_order_number: null,
    order_number: null,
    vendor_name: null,
    line_po_number: null,
    order_platform: null,
    found: true,
    has_open_claim: false,
    first_catalog_product_title: null,
    first_zoho_item_title: null,
    first_item_name: `Item ${id}`,
    first_sku: `SKU-${id}`,
    first_zoho_item_id: null,
    ...partial,
  };
}

test('unbox queue: urgent first then oldest; package urgency only (no shelf override); one pending read', async () => {
  const rows = [
    // Old, Not urgent, sitting on a rack shelf — the location never makes it urgent.
    queueRow(1, '2026-09-20T10:00:00Z', { location_id: 13, location_code: 'RK1-1', location_name: 'Rack 1 Shelf 1' }),
    queueRow(2, '2026-10-02T10:00:00Z', { priority_tier: 0 }),
    queueRow(3, '2026-10-01T10:00:00Z'), // a waiting order needs SKU-3 → urgent
    queueRow(4, '2026-09-25T10:00:00Z', { line_count: 0, skus: null, found: false, first_item_name: null, first_sku: null }),
  ];
  const pendingCalls: string[][] = [];
  const items = await readUnboxQueue(ORG, {
    readRows: async () => rows,
    pendingOrderSkus: async (_org, skus) => {
      pendingCalls.push(skus);
      return ['SKU-3'];
    },
  });
  assert.deepEqual(
    items.map((i) => [i.receivingId, i.urgency.urgent]),
    [[3, true], [2, true], [1, false], [4, false]],
  );
  assert.deepEqual(pendingCalls, [['SKU-1', 'SKU-3']]);
  assert.deepEqual(items[2].location, { id: 13, code: 'RK1-1', name: 'Rack 1 Shelf 1' });
  assert.equal(items[2].title, 'Item 1');
  assert.equal(items[3].title, null);
  assert.equal(items[3].found, false);
});

test('unbox order: urgent first, then oldest door time first, no door time last', () => {
  const row = (receivingId: number, urgent: boolean, doorReceivedAt: string | null) => ({
    receivingId,
    urgency: { urgent },
    doorReceivedAt,
  });
  const rows = orderUnboxQueue([
    row(1, false, '2026-09-01T10:00:00Z'),
    row(2, true, '2026-10-02T10:00:00Z'),
    row(3, false, null),
    row(4, true, '2026-10-01T09:00:00Z'),
    row(5, false, '2026-10-01T09:00:00Z'),
    row(6, true, '2026-10-01T09:00:00Z'),
  ]);
  assert.deepEqual(
    rows.map((r) => r.receivingId),
    [4, 6, 2, 1, 5, 3],
  );
});
