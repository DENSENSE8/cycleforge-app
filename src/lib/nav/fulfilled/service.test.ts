import test from 'node:test';
import assert from 'node:assert/strict';
import { NavFulfilledResponseSchema, type NavFulfilledResponse } from '@/lib/nav/context/schema';
import { FULFILLED_BUCKET_IDS, FULFILLED_BUCKETS } from '@/lib/nav/locate/bucket-precedence';
import { scanOutBackdated } from '@/lib/outbound/scan-out-provenance';
import { addWarehouseBusinessDays, carrierClaimWindow } from '@/lib/shipping/carrier-pickup-window';
import type { OrgId } from '@/lib/tenancy/constants';
import { firstCarrierScanAt, fulfilledPackageBucket } from './bucket';
import { getNavFulfilled, type NavFulfilledDeps, type NavFulfilledResult } from './service';
import type { FulfilledCheckInRow, FulfilledPackageRow, FulfilledWindow } from './sql';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;
const CALLER = { orgId: ORG, permissions: new Set(['packing.view']) };
const TODAY = '2026-10-05';
/** Monday 2026-10-05 12:00 PT. */
const NOW = new Date('2026-10-05T19:00:00.000Z');
const HOUR_MS = 3_600_000;
/** `hours` before {@link NOW}, ISO. */
const ago = (hours: number) => new Date(NOW.getTime() - hours * HOUR_MS).toISOString();

/** A scanned-out UPS package that is in transit (every fact the statement returns). */
function pkg(patch: Partial<FulfilledPackageRow> = {}): FulfilledPackageRow {
  return {
    orderRowId: 1,
    orderKey: '113-0000000-0000001',
    orderId: '113-0000000-0000001',
    channel: 'amazon',
    channelRaw: 'Amazon',
    channelStatus: 'shipped',
    orderedAt: '2026-09-28T16:00:00.000Z',
    qty: 1,
    saleAmount: 10,
    customer: 'Ada',
    title: 'Widget',
    sku: 'W-1',
    shipByDate: '2026-09-30',
    shipByAt: '2026-10-01T06:59:59.000Z',
    packedAt: '2026-09-29T17:00:00.000Z',
    packerId: 7,
    packerName: 'Pat',
    pickedAt: null,
    pickedBy: null,
    shipstationStatus: null,
    returnRef: null,
    shipmentId: 100,
    tracking: '1Z0000000000000001',
    carrier: 'UPS',
    service: null,
    scannedAt: '2026-09-29T18:00:00.000Z',
    scannedById: 3,
    scannedByName: 'Sam',
    scanBackdated: false,
    handOffAt: '2026-09-29T18:00:00.000Z',
    labelCreatedAt: null,
    labelCost: null,
    category: 'IN_TRANSIT',
    statusLabel: 'Departed facility',
    latestEventAt: '2026-10-04T12:00:00.000Z',
    carrierAcceptedAt: '2026-09-29T23:00:00.000Z',
    firstInTransitAt: '2026-09-30T02:00:00.000Z',
    outForDeliveryAt: null,
    deliveredAt: null,
    isDelivered: false,
    estimatedDeliveryAt: null,
    promisedAt: null,
    exceptionAt: null,
    hasException: false,
    isTerminal: false,
    sourceSystem: 'ups',
    lastCheckedAt: '2026-10-05T10:00:00.000Z',
    consecutiveErrors: 0,
    lastError: null,
    eventCount: 4,
    firstMoveEventAt: '2026-09-29T23:00:00.000Z',
    attempts: 0,
    exceptionCode: null,
    returnToSenderEvent: false,
    lastEventRecordedAt: '2026-10-05T10:00:00.000Z',
    lastEventPlace: null,
    checkIn: null,
    ...patch,
  };
}

/** Not moved yet: a label with no carrier evidence. */
const UNMOVED: Partial<FulfilledPackageRow> = {
  category: 'LABEL_CREATED',
  carrierAcceptedAt: null,
  firstInTransitAt: null,
  latestEventAt: null,
  firstMoveEventAt: null,
  eventCount: 1,
};

/** A delivered package. */
const DELIVERED: Partial<FulfilledPackageRow> = {
  category: 'DELIVERED',
  deliveredAt: '2026-10-03T20:00:00.000Z',
  isDelivered: true,
  isTerminal: true,
  latestEventAt: '2026-10-03T20:00:00.000Z',
};

/** An order's check-in in `state` (every other fact null unless patched). */
function checkIn(state: FulfilledCheckInRow['state'], patch: Partial<FulfilledCheckInRow> = {}): FulfilledCheckInRow {
  return {
    state,
    supportItemId: 55,
    triggerAt: null,
    dueAt: null,
    contactedAt: null,
    nextFollowUpAt: null,
    repliedAt: null,
    closedAt: null,
    outcome: null,
    ...patch,
  };
}

interface Captured {
  reads: Array<{ orgId: OrgId; window: FulfilledWindow; q: string | null }>;
}

function fakes(rows: FulfilledPackageRow[], now: Date = NOW) {
  const cap: Captured = { reads: [] };
  const deps: NavFulfilledDeps = {
    rows: async (orgId, window, q) => {
      cap.reads.push({ orgId, window, q });
      return rows;
    },
    today: () => TODAY,
    now: () => now,
  };
  return { deps, cap };
}

function body(result: NavFulfilledResult): NavFulfilledResponse {
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('expected ok');
  return NavFulfilledResponseSchema.parse(result.body);
}

const counts = (response: NavFulfilledResponse) => Object.fromEntries(response.buckets.map((bucket) => [bucket.id, bucket.count]));

// ── Bucket precedence ──────────────────────────────────────────────────────

test('bucket: a synthetic scan-written stamp (no moving event, no successful poll) is not movement', () => {
  const synthetic = pkg({
    ...UNMOVED,
    category: 'IN_TRANSIT',
    carrierAcceptedAt: '2026-09-01T00:00:00.000Z',
    sourceSystem: 'scan',
    eventCount: 0,
    lastCheckedAt: null,
  });
  // UPS is polled, yet never answered ok since the hand-off six days ago: we are not asking, never "no movement".
  assert.equal(fulfilledPackageBucket(synthetic, NOW), 'tracking_stale');
  // USPS is not polled: with no events it is Untracked, never In transit off its stamp.
  assert.equal(fulfilledPackageBucket({ ...synthetic, carrier: 'USPS' }, NOW), 'untracked');
  // A failed poll is not a successful one; a clean poll makes the stamps carrier evidence.
  assert.equal(fulfilledPackageBucket({ ...synthetic, lastCheckedAt: NOW.toISOString(), consecutiveErrors: 2, lastError: 'creds' }, NOW), 'no_movement');
  assert.equal(fulfilledPackageBucket({ ...synthetic, lastCheckedAt: '2026-10-05T10:00:00.000Z' }, NOW), 'in_transit');
  // A "Label created" event is not a carrier scan: the stamps stay synthetic (list and shipment record agree).
  const labelOnly = { ...synthetic, eventCount: 1, lastCheckedAt: NOW.toISOString(), consecutiveErrors: 3, lastError: 'creds' };
  assert.equal(firstCarrierScanAt(labelOnly), null);
  assert.equal(fulfilledPackageBucket(labelOnly, NOW), 'no_movement');
});

test('bucket: precedence — returned › delivered › exception › no tracking › untracked', () => {
  assert.equal(fulfilledPackageBucket(pkg({ category: 'DELIVERED', returnToSenderEvent: true }), NOW), 'returned');
  assert.equal(fulfilledPackageBucket(pkg({ deliveredAt: '2026-10-02T20:00:00.000Z', hasException: true }), NOW), 'delivered');
  assert.equal(fulfilledPackageBucket(pkg({ hasException: true }), NOW), 'exception');
  assert.equal(fulfilledPackageBucket(pkg({ shipmentId: null, tracking: null }), NOW), 'no_tracking');
  assert.equal(fulfilledPackageBucket(pkg({ carrier: 'USPS', eventCount: 0 }), NOW), 'untracked');
  assert.equal(fulfilledPackageBucket(pkg({ category: 'OUT_FOR_DELIVERY' }), NOW), 'out_for_delivery');
  assert.equal(fulfilledPackageBucket(pkg({ latestEventAt: '2026-10-01T12:00:00.000Z' }), NOW), 'stalled');
  assert.equal(fulfilledPackageBucket(pkg(), NOW), 'in_transit');
});

test('bucket: tracking stale — a polled carrier with no successful poll for 24h (never polled: since hand-off), before any movement bucket', () => {
  assert.equal(fulfilledPackageBucket(pkg({ lastCheckedAt: ago(23) }), NOW), 'in_transit');
  assert.equal(fulfilledPackageBucket(pkg({ lastCheckedAt: ago(25) }), NOW), 'tracking_stale');
  // Never polled ok: measured from the hand-off.
  assert.equal(fulfilledPackageBucket(pkg({ ...UNMOVED, lastCheckedAt: null, handOffAt: ago(23) }), NOW), 'awaiting');
  assert.equal(fulfilledPackageBucket(pkg({ ...UNMOVED, lastCheckedAt: null, handOffAt: ago(25) }), NOW), 'tracking_stale');
  // A failed poll since does not refresh it (`lastCheckedAt` is stamped on success only).
  assert.equal(fulfilledPackageBucket(pkg({ lastCheckedAt: ago(25), consecutiveErrors: 3, lastError: 'creds' }), NOW), 'tracking_stale');
  // Outranks Stalled and Late: a silent carrier is never blamed while we are not asking it.
  assert.equal(fulfilledPackageBucket(pkg({ lastCheckedAt: ago(25), latestEventAt: ago(100), promisedAt: ago(1) }), NOW), 'tracking_stale');
  // Only carriers we poll; terminal packages never.
  assert.equal(fulfilledPackageBucket(pkg({ carrier: 'USPS', lastCheckedAt: null }), NOW), 'in_transit');
  assert.equal(fulfilledPackageBucket(pkg({ ...DELIVERED, lastCheckedAt: ago(200) }), NOW), 'delivered');
  assert.equal(fulfilledPackageBucket(pkg({ category: 'RETURNED', isTerminal: true, lastCheckedAt: ago(200) }), NOW), 'returned');
});

test('bucket: late — undelivered past the FIRST promise, after Stalled, before Out for delivery / In transit', () => {
  assert.equal(fulfilledPackageBucket(pkg({ promisedAt: ago(1 / 60) }), NOW), 'late');
  assert.equal(fulfilledPackageBucket(pkg({ promisedAt: ago(-1) }), NOW), 'in_transit');
  assert.equal(fulfilledPackageBucket(pkg({ category: 'OUT_FOR_DELIVERY', promisedAt: ago(2) }), NOW), 'late');
  assert.equal(fulfilledPackageBucket(pkg({ latestEventAt: ago(100), promisedAt: ago(2) }), NOW), 'stalled');
  // Delivered is never late, however late it arrived.
  assert.equal(fulfilledPackageBucket(pkg({ ...DELIVERED, promisedAt: '2026-10-01T00:00:00.000Z' }), NOW), 'delivered');
  // Not picked up yet (handed off Friday 11:00 PT, a business day ago): the pickup buckets speak first.
  assert.equal(fulfilledPackageBucket(pkg({ ...UNMOVED, handOffAt: ago(73), promisedAt: ago(1) }), NOW), 'no_movement');
});

test('bucket: no movement waits one warehouse business day — a Friday hand-off is Awaiting pickup until Monday', () => {
  // Friday 2026-10-02 15:00 PT.
  const friday = pkg({ ...UNMOVED, handOffAt: '2026-10-02T22:00:00.000Z' });
  assert.equal(fulfilledPackageBucket(friday, new Date('2026-10-03T22:00:00.000Z')), 'awaiting'); // Sat 15:00
  assert.equal(fulfilledPackageBucket(friday, new Date('2026-10-05T21:59:00.000Z')), 'awaiting'); // Mon 14:59
  assert.equal(fulfilledPackageBucket(friday, new Date('2026-10-05T22:00:00.000Z')), 'no_movement'); // Mon 15:00
  // A weekend hand-off starts counting Monday 00:00 PT: no movement from Tuesday 00:00.
  const saturday = pkg({ ...UNMOVED, handOffAt: '2026-10-03T17:00:00.000Z' });
  assert.equal(addWarehouseBusinessDays(new Date('2026-10-03T17:00:00.000Z')).toISOString(), '2026-10-06T07:00:00.000Z');
  assert.equal(fulfilledPackageBucket(saturday, new Date('2026-10-05T23:00:00.000Z')), 'awaiting'); // Mon 16:00
  assert.equal(fulfilledPackageBucket(saturday, new Date('2026-10-06T06:59:00.000Z')), 'awaiting'); // Mon 23:59
  assert.equal(fulfilledPackageBucket(saturday, new Date('2026-10-06T07:00:00.000Z')), 'no_movement'); // Tue 00:00
});

test('claim window: USPS opens at 15 days (Express 7) and closes at 60; UPS/FedEx within 60; others unknown', () => {
  const handOff = new Date('2026-09-01T18:00:00.000Z');
  assert.deepEqual(carrierClaimWindow('USPS', handOff), { opensAt: '2026-09-16T18:00:00.000Z', closesAt: '2026-10-31T18:00:00.000Z' });
  assert.equal(carrierClaimWindow('usps', handOff, 'usps_priority_mail_express')?.opensAt, '2026-09-08T18:00:00.000Z');
  assert.equal(carrierClaimWindow('FEDEX', handOff)?.closesAt, '2026-10-31T18:00:00.000Z');
  assert.equal(carrierClaimWindow('LOCAL', handOff), null);
});

// ── The read ───────────────────────────────────────────────────────────────

test('getNavFulfilled: order grain is delivered only when every package is; line grain paints each line', async () => {
  const delivered = { category: 'DELIVERED', deliveredAt: '2026-10-03T20:00:00.000Z', isDelivered: true };
  const rows = [
    // Order A: two lines, two packages — one delivered, one still in transit.
    pkg({ orderRowId: 1, shipmentId: 100, ...delivered }),
    pkg({ orderRowId: 2, shipmentId: 101, tracking: '1Z0000000000000002', title: 'Gadget', sku: 'G-1', qty: 2, saleAmount: 5 }),
    // Order B: two lines sharing one delivered package.
    pkg({ orderRowId: 3, orderKey: '114-B', orderId: '114-B', shipmentId: 200, tracking: '1Z0000000000000003', ...delivered }),
    pkg({ orderRowId: 4, orderKey: '114-B', orderId: '114-B', shipmentId: 200, tracking: '1Z0000000000000003', ...delivered }),
  ];
  const orders = body(await getNavFulfilled(CALLER, new URLSearchParams(), fakes(rows).deps));
  assert.equal(orders.total, 2);
  const a = orders.entries.find((entry) => entry.ref === '113-0000000-0000001')!;
  assert.deepEqual(a.buckets, ['in_transit']);
  assert.equal(a.facts?.lineCount, 2);
  assert.equal(a.facts?.packages, 2);
  assert.equal(a.facts?.qty, 3);
  assert.equal(a.facts?.orderTotal, 15);
  // The first line's title; the sheet adds "+1" from lineCount.
  assert.equal(a.facts?.title, 'Widget');
  assert.deepEqual(a.facts?.trackings, ['1Z0000000000000001', '1Z0000000000000002']);
  assert.equal(a.recordHref, '/fulfilled?openOrderId=1');
  const b = orders.entries.find((entry) => entry.ref === '114-B')!;
  assert.deepEqual(b.buckets, ['delivered']);
  assert.equal(b.facts?.packages, 1);
  assert.equal(b.facts?.trackings, undefined);
  assert.equal(b.facts?.lineCount, 2);
  assert.equal(b.facts?.lines, 2);
  // Order rows are keyed by their number; the wire omits nulls and the parse restores the base ones.
  assert.equal(b.key, undefined);
  assert.equal(b.title, null);
  assert.equal(b.facts?.po, null);
  assert.equal(b.facts?.section, 'outbound');

  const lines = body(await getNavFulfilled(CALLER, new URLSearchParams({ grain: 'line' }), fakes(rows).deps));
  assert.equal(lines.total, 4);
  assert.deepEqual(new Set(lines.entries.map((entry) => entry.key)), new Set(['line:1', 'line:2', 'line:3', 'line:4']));
  assert.deepEqual(counts(lines), { ...counts(orders), delivered: 3, in_transit: 1 });
  assert.ok(lines.total >= orders.total);
});

test('getNavFulfilled: an order reads the picker of its last-picked line, with the resolver source', async () => {
  const rows = [
    pkg({ orderRowId: 1, pickedAt: '2026-09-29T15:00:00.000Z', pickedBy: { id: 4, name: 'Tuan', source: 'pick_scan' } }),
    pkg({ orderRowId: 2, pickedAt: '2026-09-29T16:00:00.000Z', pickedBy: { id: 5, name: 'Kai', source: 'inventory_event' } }),
    pkg({ orderRowId: 3, orderKey: '114-B', orderId: '114-B', shipmentId: 200, tracking: '1Z0000000000000003' }),
  ];
  const orders = body(await getNavFulfilled(CALLER, new URLSearchParams(), fakes(rows).deps));
  const a = orders.entries.find((entry) => entry.ref === '113-0000000-0000001')!;
  assert.equal(a.facts?.pickedAt, '2026-09-29T16:00:00.000Z');
  assert.deepEqual(a.facts?.pickedBy, { id: 5, name: 'Kai', source: 'inventory_event' });
  // No pick on record: null, never the pick assignee.
  const b = orders.entries.find((entry) => entry.ref === '114-B')!;
  assert.equal(b.facts?.pickedBy, null);
  assert.equal(b.facts?.pickedAt, null);
});

test('getNavFulfilled: buckets count the window (status ignored), sum to the total, zero buckets included', async () => {
  const rows = [
    pkg({ orderRowId: 1, orderKey: 'A', orderId: 'A' }),
    pkg({ orderRowId: 2, orderKey: 'B', orderId: 'B', shipmentId: 2, ...UNMOVED, handOffAt: '2026-10-05T16:00:00.000Z' }),
    pkg({ orderRowId: 3, orderKey: 'C', orderId: 'C', shipmentId: null, tracking: null, scannedAt: null }),
  ];
  const all = body(await getNavFulfilled(CALLER, new URLSearchParams(), fakes(rows).deps));
  assert.equal(all.buckets.length, FULFILLED_BUCKETS.length);
  assert.equal(all.buckets.reduce((sum, bucket) => sum + bucket.count, 0), all.total);
  assert.deepEqual(counts(all), {
    ...Object.fromEntries(FULFILLED_BUCKET_IDS.map((id) => [id, 0])),
    no_tracking: 1,
    awaiting: 1,
    in_transit: 1,
  });
  const narrowed = body(await getNavFulfilled(CALLER, new URLSearchParams({ status: 'awaiting' }), fakes(rows).deps));
  assert.deepEqual(narrowed.entries.map((entry) => entry.ref), ['B']);
  assert.deepEqual(counts(narrowed), counts(all));
  assert.equal(narrowed.entries[0]!.facts?.scanSource, 'live');
  assert.equal(all.entries.find((entry) => entry.ref === 'C')!.facts?.scanSource, null);
});

test('getNavFulfilled: a delivered order is painted with its check-in stage; delivered axis and facts stay', async () => {
  const rows = [
    pkg({ orderRowId: 1, orderKey: 'A', orderId: 'A', ...DELIVERED }),
    pkg({
      orderRowId: 2, orderKey: 'B', orderId: 'B', shipmentId: 2, ...DELIVERED, promisedAt: '2026-10-02T00:00:00.000Z',
      checkIn: checkIn('resolved', { outcome: 'happy', closedAt: '2026-10-05T17:00:00.000Z' }),
    }),
    pkg({
      orderRowId: 3, orderKey: 'C', orderId: 'C', shipmentId: 3, ...DELIVERED,
      checkIn: checkIn('not_due', { triggerAt: '2026-10-03T20:00:00.000Z', dueAt: '2026-10-05T20:00:00.000Z' }),
    }),
  ];
  const response = body(await getNavFulfilled(CALLER, new URLSearchParams({ sort: 'delivered' }), fakes(rows).deps));
  const byRef = Object.fromEntries(response.entries.map((entry) => [entry.ref, entry]));
  assert.deepEqual(byRef.A!.buckets, ['delivered']);
  assert.deepEqual(byRef.A!.facts?.clock, { since: '2026-10-03T20:00:00.000Z', due: null });
  assert.equal(byRef.A!.facts?.checkIn, undefined);
  assert.deepEqual(byRef.B!.buckets, ['happy']);
  assert.equal(byRef.B!.facts?.deliveredAt, '2026-10-03T20:00:00.000Z');
  assert.equal(byRef.B!.facts?.shipmentId, 2);
  assert.equal(byRef.B!.facts?.promisedAt, '2026-10-02T00:00:00.000Z');
  assert.deepEqual(byRef.B!.facts?.clock, { since: '2026-10-05T17:00:00.000Z', due: null });
  assert.deepEqual(byRef.B!.facts?.checkIn, {
    state: 'resolved', supportItemId: 55, dueAt: null, contactedAt: null, nextFollowUpAt: null, repliedAt: null,
    closedAt: '2026-10-05T17:00:00.000Z', outcome: 'happy',
  });
  assert.deepEqual(byRef.C!.buckets, ['check_in_scheduled']);
  assert.deepEqual(byRef.C!.facts?.clock, { since: '2026-10-03T20:00:00.000Z', due: '2026-10-05T20:00:00.000Z' });
  // Every row is delivered on the delivered axis, whatever its stage.
  assert.ok(response.entries.every((entry) => entry.facts?.deliveredAt === '2026-10-03T20:00:00.000Z'));
  assert.equal(counts(response).delivered, 1);

  const happy = body(await getNavFulfilled(CALLER, new URLSearchParams({ status: 'happy' }), fakes(rows).deps));
  assert.deepEqual(happy.entries.map((entry) => entry.ref), ['B']);
});

test('getNavFulfilled: a not-delivered order whose customer is owed a reply is Reply due, outranking In transit; claim stays the carrier\'s', async () => {
  const rows = [
    pkg({ orderRowId: 1, orderKey: 'A', orderId: 'A', checkIn: checkIn('staff_reply_due', { repliedAt: ago(5) }) }),
    pkg({ orderRowId: 2, orderKey: 'B', orderId: 'B', shipmentId: 2, checkIn: checkIn('contacted', { contactedAt: ago(5) }) }),
    pkg({ orderRowId: 3, orderKey: 'C', orderId: 'C', shipmentId: 3, promisedAt: ago(3) }),
  ];
  const response = body(await getNavFulfilled(CALLER, new URLSearchParams({ sort: 'status' }), fakes(rows).deps));
  assert.deepEqual(response.entries.map((entry) => [entry.ref, entry.buckets[0]]), [
    ['A', 'reply_due'],
    ['C', 'late'],
    ['B', 'in_transit'],
  ]);
  const [a, c] = response.entries;
  assert.deepEqual(a!.facts?.clock, { since: ago(5), due: ago(5 - 24) });
  assert.equal(a!.facts?.claim, undefined);
  // Late: since the hand-off, due the promise; a lost-package claim applies.
  assert.deepEqual(c!.facts?.clock, { since: '2026-09-29T18:00:00.000Z', due: ago(3) });
  assert.deepEqual(c!.facts?.claim, carrierClaimWindow('UPS', new Date('2026-09-29T18:00:00.000Z')));
});

test('scan provenance: backdated = a scripted catch-up source, or written > 2 min from the instant it stamps; a replay is the dock instant', () => {
  const at = '2026-10-01T18:00:00.000Z';
  const later = '2026-10-02T15:00:00.000Z';
  // A live origin written at the moment is the hand-off; the same origin backdated is not.
  assert.equal(scanOutBackdated({ source: 'shipped-scan-out', createdAt: at, updatedAt: '2026-10-01T18:00:01.000Z' }), false);
  assert.equal(scanOutBackdated({ source: 'shipped-scan-out', createdAt: at, updatedAt: later }), true);
  assert.equal(scanOutBackdated({ source: 'bulk-scan-out', createdAt: at, updatedAt: at }), false);
  assert.equal(scanOutBackdated({ source: 'bulk-scan-out', createdAt: at, updatedAt: later }), true);
  // Scripted runs are backfills even when both columns carry the chosen instant.
  assert.equal(scanOutBackdated({ source: 'backfill-ship-confirm', createdAt: at, updatedAt: at }), true);
  assert.equal(scanOutBackdated({ source: 'bulk-catchup-scan-out', createdAt: at, updatedAt: at }), true);
  // A held unmatched scan replayed later keeps the real dock instant.
  assert.equal(scanOutBackdated({ source: 'unmatched-scan-out-replay', createdAt: at, updatedAt: later }), false);
  assert.equal(scanOutBackdated({ source: null, createdAt: at, updatedAt: later }), true);
});

test('getNavFulfilled: each facet counts with every OTHER filter, never its own', async () => {
  const rows = [
    pkg({ orderRowId: 1, orderKey: 'A', orderId: 'A', carrier: 'UPS', channel: 'amazon' }),
    pkg({ orderRowId: 2, orderKey: 'B', orderId: 'B', shipmentId: 2, carrier: 'USPS', channel: 'amazon', eventCount: 0, scanBackdated: true }),
    pkg({ orderRowId: 3, orderKey: 'C', orderId: 'C', shipmentId: 3, carrier: 'USPS', channel: 'ebay', channelRaw: 'eBay', eventCount: 0 }),
  ];
  const response = body(await getNavFulfilled(CALLER, new URLSearchParams({ carrier: 'ups' }), fakes(rows).deps));
  assert.deepEqual(response.entries.map((entry) => entry.ref), ['A']);
  // Carrier ignores its own filter; channel and scan count only the UPS row.
  assert.deepEqual(response.facets.carriers, [
    { value: 'USPS', label: 'USPS', count: 2 },
    { value: 'UPS', label: 'UPS', count: 1 },
  ]);
  assert.deepEqual(response.facets.channels, [{ value: 'amazon', label: 'Amazon', count: 1 }]);
  assert.deepEqual(response.facets.scans, [{ value: 'live', label: 'Live', count: 1 }]);
  assert.deepEqual(response.facets.packers, [{ id: 7, name: 'Pat', count: 1 }]);

  const byScan = body(await getNavFulfilled(CALLER, new URLSearchParams({ scan: 'backfill' }), fakes(rows).deps));
  assert.deepEqual(byScan.entries.map((entry) => entry.ref), ['B']);
  assert.deepEqual(byScan.facets.scans, [
    { value: 'live', label: 'Live', count: 2 },
    { value: 'backfill', label: 'Backfill', count: 1 },
  ]);
});

test('getNavFulfilled: sorts put nulls last in either direction', async () => {
  const rows = [
    pkg({ orderRowId: 1, orderKey: 'A', orderId: 'A', deliveredAt: null }),
    pkg({ orderRowId: 2, orderKey: 'B', orderId: 'B', shipmentId: 2, category: 'DELIVERED', deliveredAt: '2026-10-01T00:00:00.000Z' }),
    pkg({ orderRowId: 3, orderKey: 'C', orderId: 'C', shipmentId: 3, category: 'DELIVERED', deliveredAt: '2026-10-03T00:00:00.000Z' }),
  ];
  const desc = body(await getNavFulfilled(CALLER, new URLSearchParams({ sort: 'delivered' }), fakes(rows).deps));
  assert.deepEqual(desc.entries.map((entry) => entry.ref), ['C', 'B', 'A']);
  const asc = body(await getNavFulfilled(CALLER, new URLSearchParams({ sort: 'delivered', dir: 'asc' }), fakes(rows).deps));
  assert.deepEqual(asc.entries.map((entry) => entry.ref), ['B', 'C', 'A']);
});

test('getNavFulfilled: threads the org, the default 90-day shipped window and the Find text into the read', async () => {
  const { deps, cap } = fakes([]);
  body(await getNavFulfilled(CALLER, new URLSearchParams({ q: ' 0001 ' }), deps));
  assert.deepEqual(cap.reads, [
    {
      orgId: ORG,
      window: { axis: 'shipped', fromAt: '2026-07-08T07:00:00.000Z', toBefore: '2026-10-06T07:00:00.000Z' },
      q: '0001',
    },
  ]);
  const allTime = fakes([]);
  body(await getNavFulfilled(CALLER, new URLSearchParams({ axis: 'ordered', from: 'all' }), allTime.deps));
  assert.deepEqual(allTime.cap.reads[0]!.window, { axis: 'ordered', fromAt: null, toBefore: null });
});

test('getNavFulfilled: a scan-out with no order is its own row, opened by its shipment', async () => {
  const rows = [
    pkg({
      orderRowId: -50,
      orderKey: 'scan:50',
      orderId: 'FBA15ABCDEFGH',
      channel: null,
      channelRaw: null,
      channelStatus: null,
      title: null,
      sku: null,
      customer: null,
      shipmentId: 50,
      tracking: 'FBA15ABCDEFGH',
      carrier: 'UNKNOWN',
      sourceSystem: 'scan',
      category: null,
      eventCount: 0,
      packedAt: null,
      packerId: null,
      packerName: null,
    }),
  ];
  const response = body(await getNavFulfilled(CALLER, new URLSearchParams(), fakes(rows).deps));
  assert.equal(response.total, 1);
  const entry = response.entries[0]!;
  assert.equal(entry.ref, 'FBA15ABCDEFGH');
  assert.equal(entry.recordHref, null);
  assert.equal(entry.facts?.shipmentId, 50);
  assert.equal(entry.facts?.tracking, 'FBA15ABCDEFGH');
  assert.equal(entry.facts?.scanSource, 'live');
  assert.deepEqual(entry.buckets, ['untracked']);
});

test('getNavFulfilled: refuses without packing.view and rejects a bad query, reading nothing', async () => {
  const { deps, cap } = fakes([pkg()]);
  const forbidden = await getNavFulfilled({ orgId: ORG, permissions: new Set() }, new URLSearchParams(), deps);
  assert.deepEqual(forbidden, { ok: false, status: 403, error: 'FORBIDDEN', permission: 'packing.view' });
  const bad = await getNavFulfilled(CALLER, new URLSearchParams({ axis: 'packed' }), deps);
  assert.equal(bad.ok, false);
  assert.equal(!bad.ok && bad.status, 400);
  assert.equal(cap.reads.length, 0);
});
