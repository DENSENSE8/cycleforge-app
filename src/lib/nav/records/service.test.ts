import test from 'node:test';
import assert from 'node:assert/strict';
import { NavRecordsResponseSchema, type NavRecordsResponse } from '@/lib/nav/context/schema';
import type { OrgId } from '@/lib/tenancy/constants';
import { getNavRecords, type NavRecordsDeps, type NavRecordsResult } from './service';
import type { RecordLineRow, RecordPackageRow, RecordsSqlInput } from './sql';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;
const BOTH = new Set(['orders.view', 'receiving.view']);
const TODAY = '2026-10-05';
/** Monday 2026-10-05 12:00 PT. */
const NOW = new Date('2026-10-05T19:00:00.000Z');

function pkg(patch: Partial<RecordPackageRow> = {}): RecordPackageRow {
  return {
    shipmentId: 100,
    tracking: '1Z0000000000000001',
    carrier: 'UPS',
    category: 'IN_TRANSIT',
    statusLabel: 'Departed facility',
    latestEventAt: '2026-10-04T12:00:00Z',
    eta: null,
    deliveredAt: null,
    place: 'Anaheim, CA',
    primary: true,
    ...patch,
  };
}

/** An outbound line nobody has touched yet (To pick, no package). */
function outLine(patch: Partial<RecordLineRow> = {}): RecordLineRow {
  return {
    direction: 'outbound',
    recordId: 1,
    orderNumber: '113-0000000-0000001',
    orderKey: 'o:amazon|113-0000000-0000001',
    itemNumber: 'B000ITEM',
    skuCatalogId: 42,
    title: 'Widget',
    sku: 'w-1',
    qty: 2,
    unitPrice: 10,
    lineTotal: 20,
    orderTotal: 35,
    orderTotalSource: 'lines',
    orderLines: 2,
    platform: 'amazon',
    platformAccountLabel: null,
    customer: 'Ada',
    vendor: null,
    po: null,
    channelStatus: 'unshipped',
    placedAt: '2026-10-01T16:00:00Z',
    placedOn: null,
    importedAt: '2026-10-01T17:00:00Z',
    orderedAt: '2026-10-01T16:00:00Z',
    shipByDate: null,
    shipByAt: null,
    pickedAt: null,
    pickedBy: null,
    packedAt: null,
    packer: null,
    scannedAt: null,
    scannedBy: null,
    shippedAt: null,
    unboxedAt: null,
    unboxedBy: null,
    receivedAt: null,
    receivedBy: null,
    unitsReceived: null,
    unitsExpected: null,
    receivedDone: false,
    inboundOrderId: null,
    cartonId: null,
    service: null,
    packages: [],
    buyerCancelled: false,
    scannedOut: false,
    releaseState: null,
    outOfStock: false,
    holdFlag: false,
    packed: false,
    picked: false,
    lineStatus: null,
    workflowStatus: null,
    exceptionCode: null,
    lastNote: null,
    hasNote: false,
    owner: null,
    mine: false,
    matchedRefs: [],
    cartonOnly: false,
    ...patch,
  };
}

/** An inbound line on a Zoho PO, tracking known, not yet opened. */
function inLine(patch: Partial<RecordLineRow> = {}): RecordLineRow {
  return outLine({
    direction: 'inbound',
    recordId: 500,
    orderNumber: 'PO-0042',
    orderKey: 'i:9',
    itemNumber: null,
    skuCatalogId: null,
    title: 'Speaker',
    sku: 'sp-9',
    qty: 3,
    unitPrice: 4.5,
    lineTotal: 13.5,
    orderTotal: 13.5,
    orderLines: 1,
    platform: 'zoho',
    customer: null,
    vendor: 'Acme',
    po: 'PO-0042',
    channelStatus: 'open',
    unitsExpected: 3,
    unitsReceived: 0,
    inboundOrderId: 9,
    cartonId: 77,
    packages: [pkg({ shipmentId: 200, tracking: '9400100000000000000001', carrier: 'USPS' })],
    lineStatus: 'INCOMING',
    workflowStatus: 'EXPECTED',
    ...patch,
  });
}

function fakes(lines: RecordLineRow[]) {
  const cap: { inputs: RecordsSqlInput[] } = { inputs: [] };
  const deps: NavRecordsDeps = {
    rows: async (orgId, input) => {
      assert.equal(orgId, ORG);
      cap.inputs.push(input);
      return lines;
    },
    today: () => TODAY,
    now: () => NOW,
  };
  return { deps, cap };
}

async function read(lines: RecordLineRow[], query: Record<string, string> = {}, permissions: ReadonlySet<string> = BOTH) {
  const { deps, cap } = fakes(lines);
  const result: NavRecordsResult = await getNavRecords({ orgId: ORG, permissions, staffId: 5 }, new URLSearchParams(query), deps);
  assert.ok(result.ok, 'read answers');
  // What the client holds: the compact wire parsed back.
  const body: NavRecordsResponse = NavRecordsResponseSchema.parse(JSON.parse(JSON.stringify(result.body)));
  return { body, cap };
}

const byKey = (body: NavRecordsResponse, key: string) => body.entries.find((entry) => entry.key === key)!;
const counts = (body: NavRecordsResponse, facet: keyof NavRecordsResponse['facets']) =>
  Object.fromEntries(body.facets[facet].map((option) => [option.value, option.count]));

test('every line reads its Internal and External status through record-status', async () => {
  const { body } = await read([
    outLine({ recordId: 1, picked: true, packed: true }),
    outLine({
      recordId: 2,
      picked: true,
      packed: true,
      scannedOut: true,
      packages: [pkg({ category: 'DELIVERED', deliveredAt: '2026-10-03T20:00:00Z' })],
    }),
    outLine({ recordId: 3, holdFlag: true }),
    outLine({ recordId: 4, scannedOut: true, buyerCancelled: true }),
    // One delivered box never hides one still in transit.
    outLine({
      recordId: 5,
      scannedOut: true,
      packages: [pkg({ shipmentId: 1, category: 'DELIVERED', deliveredAt: '2026-10-03T20:00:00Z' }), pkg({ shipmentId: 2, primary: false })],
    }),
    inLine({ recordId: 501, packages: [] }),
    inLine({ recordId: 502 }),
    inLine({ recordId: 503, unboxedAt: '2026-10-04T18:00:00Z' }),
    inLine({ recordId: 504, unitsReceived: 3, packages: [pkg({ shipmentId: 9, category: 'DELIVERED', deliveredAt: '2026-10-02T20:00:00Z' })] }),
    inLine({ recordId: 505, lineStatus: null, workflowStatus: 'AWAITING_TEST' }),
    // Marked delivered by a dock scan, the carrier never polled: no category, still Delivered.
    outLine({ recordId: 6, scannedOut: true, packages: [pkg({ category: null, statusLabel: null, deliveredAt: '2026-10-02T18:00:00Z' })] }),
    // No category and not delivered: no carrier status at all.
    outLine({ recordId: 7, scannedOut: true, packages: [pkg({ category: null, statusLabel: null })] }),
  ]);
  const status = (key: string) => [byKey(body, key).facts!.internalStatus, byKey(body, key).facts!.externalStatus ?? null];
  assert.deepEqual(status('out:1'), ['packed', null]);
  assert.deepEqual(status('out:2'), ['scanned_out', 'delivered']);
  assert.deepEqual(status('out:3'), ['on_hold', null]);
  assert.deepEqual(status('out:4'), ['buyer_cancel', null]);
  assert.deepEqual(status('out:5'), ['scanned_out', 'in_transit']);
  assert.deepEqual(status('in:501'), ['awaiting_tracking', null]);
  assert.deepEqual(status('in:502'), ['not_received', 'in_transit']);
  assert.deepEqual(status('in:503'), ['unboxed', 'in_transit']);
  assert.deepEqual(status('in:504'), ['received', 'delivered']);
  assert.deepEqual(status('in:505'), ['received', 'in_transit']);
  assert.deepEqual(status('out:6'), ['scanned_out', 'delivered']);
  assert.deepEqual(status('out:7'), ['scanned_out', null]);
  // The bucket is the internal status; the detail the carrier's words.
  assert.deepEqual(byKey(body, 'out:1').buckets, ['packed']);
  assert.equal(byKey(body, 'in:502').detail, 'Departed facility');
  assert.equal(byKey(body, 'out:2').facts!.deliveredAt, '2026-10-03T20:00:00Z');
});

test('the order, item and product grain keys and the price fields ride every line', async () => {
  const { body } = await read([outLine(), inLine()]);
  const out = byKey(body, 'out:1');
  assert.equal(out.ref, '113-0000000-0000001');
  assert.equal(out.facts!.direction, 'outbound');
  assert.equal(out.facts!.recordId, 1);
  assert.equal(out.facts!.orderRowId, 1);
  assert.equal(out.facts!.orderKey, 'o:amazon|113-0000000-0000001');
  assert.equal(out.facts!.itemNumber, 'B000ITEM');
  assert.equal(out.facts!.productKey, 'c:42');
  assert.equal(out.facts!.unitPrice, 10);
  assert.equal(out.facts!.lineTotal, 20);
  assert.equal(out.facts!.orderTotal, 35);
  assert.equal(out.facts!.lines, 2);
  const inbound = byKey(body, 'in:500');
  assert.equal(inbound.ref, 'PO-0042');
  assert.equal(inbound.facts!.direction, 'inbound');
  assert.equal(inbound.facts!.section, 'inbound');
  assert.equal(inbound.facts!.orderKey, 'i:9');
  assert.equal(inbound.facts!.productKey, 's:SP-9');
  assert.equal(inbound.facts!.unitPrice, 4.5);
  assert.equal(inbound.facts!.lineTotal, 13.5);
  assert.equal(inbound.facts!.inboundOrderId, 9);
  assert.equal(inbound.facts!.cartonId, 77);
  assert.deepEqual(inbound.facts!.units, { received: 0, expected: 3 });
  // Inbound with no number reads its tracking.
  const { body: bare } = await read([inLine({ orderNumber: null })]);
  assert.equal(bare.entries[0]!.ref, '9400100000000000000001');
});

test('include keeps any of its values; exclude drops them — per facet', async () => {
  const lines = [
    outLine({ recordId: 1, platform: 'amazon' }),
    outLine({ recordId: 2, platform: 'ebay', customer: 'Bo' }),
    inLine({ recordId: 500 }),
  ];
  const keys = (body: NavRecordsResponse) => body.entries.map((entry) => entry.key).sort();
  assert.deepEqual(keys((await read(lines, { platform: 'ebay' })).body), ['out:2']);
  assert.deepEqual(keys((await read(lines, { xplatform: 'ebay' })).body), ['in:500', 'out:1']);
  assert.deepEqual(keys((await read(lines, { type: 'inbound' })).body), ['in:500']);
  assert.deepEqual(keys((await read(lines, { xtype: 'inbound' })).body), ['out:1', 'out:2']);
  assert.deepEqual(keys((await read(lines, { istatus: 'not_received,to_pick' })).body), ['in:500', 'out:1', 'out:2']);
  assert.deepEqual(keys((await read(lines, { xestatus: 'none' })).body), ['in:500']);
  // A flag is one of several values a line carries: include = has it, exclude = lacks it.
  assert.deepEqual(keys((await read(lines, { flag: 'no_tracking' })).body), ['out:1', 'out:2']);
  assert.deepEqual(keys((await read(lines, { xflag: 'no_tracking' })).body), ['in:500']);
  // Price bands on the LINE total; no total = `none`.
  const priced = [outLine({ recordId: 1, lineTotal: 20 }), outLine({ recordId: 2, lineTotal: 120 }), outLine({ recordId: 3, lineTotal: null })];
  assert.deepEqual(keys((await read(priced, { price: 'p100' })).body), ['out:2']);
  assert.deepEqual(keys((await read(priced, { xprice: 'none,p0' })).body), ['out:2']);
  const { body } = await read(priced, { price: 'p100' });
  assert.equal(body.total, 1);
});

test('each facet counts with every OTHER facet applied — its own include and exclude lifted', async () => {
  const lines = [
    outLine({ recordId: 1, platform: 'amazon' }),
    outLine({ recordId: 2, platform: 'ebay' }),
    outLine({ recordId: 3, platform: 'ebay', picked: true }),
    inLine({ recordId: 500 }),
  ];
  const { body } = await read(lines, { platform: 'ebay', xtype: 'inbound' });
  assert.deepEqual(body.entries.map((entry) => entry.key).sort(), ['out:2', 'out:3']);
  // Platform lifts its own include, keeps the Type exclude: amazon and ebay (outbound), no zoho.
  assert.deepEqual(counts(body, 'platform'), { amazon: 1, ebay: 2 });
  // Type lifts its own exclude, keeps the platform include: only ebay lines (outbound).
  assert.deepEqual(counts(body, 'type'), { outbound: 2 });
  // Every other facet counts the kept rows.
  assert.deepEqual(counts(body, 'internal'), { to_pick: 1, picked: 1 });
  assert.deepEqual(body.facets.internal.map((option) => option.label), ['To pick', 'Picked']);
  assert.equal(body.facets.platform.find((option) => option.value === 'amazon')!.label, 'Amazon');
});

test('a pasted list answers in paste order, with a miss entry where a ref matched nothing', async () => {
  const lines = [
    outLine({ recordId: 1, orderNumber: 'B-2', matchedRefs: [3] }),
    inLine({ recordId: 500, matchedRefs: [1] }),
    // One line named by two refs (its order # and its tracking) is a duplicate paste.
    outLine({ recordId: 2, orderNumber: 'C-3', orderKey: 'o:amazon|C-3', matchedRefs: [4, 5] }),
  ];
  const { body, cap } = await read(lines, { refs: 'PO-0042,ZZZ-404,B-2,C-3,1Z999' });
  assert.deepEqual(
    body.entries.map((entry) => entry.key),
    ['in:500', 'miss:ZZZ404', 'out:1', 'out:2'],
  );
  const miss = byKey(body, 'miss:ZZZ404');
  assert.equal(miss.ref, 'ZZZ-404');
  assert.deepEqual(miss.buckets, []);
  assert.equal(miss.detail, 'Not found');
  assert.equal(miss.facts, null);
  // The statement got the refs in paste order and no window (a pasted list has none).
  assert.deepEqual(cap.inputs[0]!.refs, ['PO-0042', 'ZZZ-404', 'B-2', 'C-3', '1Z999']);
  assert.equal(cap.inputs[0]!.fromAt, null);
  assert.equal(cap.inputs[0]!.toBefore, null);
  // Misses never count as lines.
  assert.equal(body.total, 3);
  assert.deepEqual(byKey(body, 'out:2').facts!.flags, ['no_tracking', 'duplicate']);
  // Another sort: misses go last, in paste order.
  const { body: byDate } = await read(lines, { refs: 'PO-0042,ZZZ-404,B-2,C-3,1Z999', colsort: 'price' });
  assert.equal(byDate.entries.at(-1)!.key, 'miss:ZZZ404');
});

test('a pasted box with no lines yet is a carton row — found, not a miss, and nothing to write to', async () => {
  const carton = inLine({
    recordId: 53019,
    cartonOnly: true,
    orderNumber: 'PO-0099',
    title: null,
    orderKey: 'i:c53019',
    inboundOrderId: null,
    cartonId: 53019,
    matchedRefs: [1],
  });
  const { body } = await read([carton], { refs: 'PO-0099' });
  assert.deepEqual(body.entries.map((entry) => entry.key), ['carton:53019']);
  const row = byKey(body, 'carton:53019');
  assert.equal(row.facts!.recordId, undefined);
  assert.equal(row.facts!.title, 'Carton · no lines yet');
  assert.equal(row.facts!.internalStatus, 'not_received');
  assert.equal(row.facts!.cartonId, 53019);
});

test('flags: late, exception, note, mine; the same number under two orders is a duplicate', async () => {
  const { body } = await read([
    outLine({ recordId: 1, shipByAt: '2026-10-02T06:59:59Z', shipByDate: '2026-10-01', hasNote: true, mine: true }),
    outLine({
      recordId: 2,
      orderNumber: 'X-2',
      orderKey: 'o:amazon|X-2',
      shipByAt: '2026-10-02T06:59:59Z',
      scannedOut: true,
      packages: [pkg({ category: 'EXCEPTION' })],
    }),
    // Delivered three days ago, never opened: past the dock's 48 h.
    inLine({ recordId: 500, packages: [pkg({ category: 'DELIVERED', deliveredAt: '2026-10-02T19:00:00Z' })] }),
    inLine({ recordId: 501, orderNumber: '113-0000000-0000001', orderKey: 'i:10' }),
  ]);
  assert.deepEqual(byKey(body, 'out:1').facts!.flags, ['late', 'no_tracking', 'duplicate', 'has_note', 'mine']);
  assert.deepEqual(byKey(body, 'out:2').facts!.flags, ['exception']);
  assert.deepEqual(byKey(body, 'in:500').facts!.flags, ['late']);
  assert.deepEqual(byKey(body, 'in:501').facts!.flags, ['duplicate']);
  assert.deepEqual(counts(body, 'flag'), { late: 2, exception: 1, no_tracking: 1, duplicate: 2, has_note: 1, mine: 1 });
});

test('a caller with one permission reads only that direction; none is refused', async () => {
  const { cap } = await read([inLine()], {}, new Set(['receiving.view']));
  assert.equal(cap.inputs[0]!.outbound, false);
  assert.equal(cap.inputs[0]!.inbound, true);
  // No dates and no paste = the last 30 PT days, today included.
  assert.equal(cap.inputs[0]!.fromAt, '2026-09-06T07:00:00.000Z');
  assert.equal(cap.inputs[0]!.toBefore, '2026-10-06T07:00:00.000Z');
  assert.equal(cap.inputs[0]!.viewerStaffId, 5);
  const { deps, cap: none } = fakes([]);
  const refused = await getNavRecords({ orgId: ORG, permissions: new Set(['packing.view']) }, new URLSearchParams(), deps);
  assert.equal(refused.ok, false);
  assert.equal(none.inputs.length, 0);
});

test('sorts: internal walk, then price highest first', async () => {
  const lines = [
    outLine({ recordId: 1, scannedOut: true, lineTotal: 5 }),
    outLine({ recordId: 2, lineTotal: 50 }),
    inLine({ recordId: 500, lineTotal: 500 }),
  ];
  const { body: internal } = await read(lines, { colsort: 'internal' });
  assert.deepEqual(internal.entries.map((entry) => entry.key), ['out:2', 'out:1', 'in:500']);
  const { body: price } = await read(lines, { colsort: 'price' });
  assert.deepEqual(price.entries.map((entry) => entry.key), ['in:500', 'out:2', 'out:1']);
});
