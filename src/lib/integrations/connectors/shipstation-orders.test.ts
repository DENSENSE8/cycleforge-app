import test from 'node:test';
import assert from 'node:assert/strict';
import type { ShipStationV1Order, ShipStationV1Store } from '@/lib/shipping/shipstation/orders-v1';
import type { PlatformOf } from '@/lib/orders/order-source-match';
import {
  attributeStore,
  backfillWindows,
  buildStoreAttributions,
  planShipStationOrders,
  resumeFrom,
  toCanonicalLine,
  type AttributionCatalog,
  type ExistingOrderRow,
} from './shipstation-orders';

/**
 * DB-free: ShipStation store → platform attribution, the canonical line, the
 * reconciliation plan (import / enrich / skip / quarantine) and backfill resume.
 * Run: node --require ./scripts/register-server-only-shim.cjs --import tsx --test src/lib/integrations/connectors/shipstation-orders.test.ts
 */

const store = (storeId: number, marketplaceName: string, over: Partial<ShipStationV1Store> = {}): ShipStationV1Store => ({
  storeId,
  storeName: `${marketplaceName} store`,
  marketplace: null,
  marketplaceId: null,
  marketplaceName,
  active: true,
  ...over,
});

const STORES = [
  store(1, 'Amazon'),
  store(2, 'eBay', { storeName: 'eBay Mekong' }),
  store(3, 'Ecwid by Lightspeed'),
  store(4, 'Shopify'),
  store(5, 'ShipStation', { storeName: 'Manual Orders' }),
  store(6, 'Label Api'),
  store(7, 'Walmart'),
];

// The org's existing account_source spellings, as the catalog places them.
const CATALOG: AttributionCatalog = {
  bindings: new Map(),
  spellings: [
    { accountSource: 'Amazon', platform: 'amazon', count: 1873 },
    { accountSource: 'amazon', platform: 'amazon', count: 8 },
    { accountSource: 'eBay', platform: 'ebay', count: 1090 },
    { accountSource: 'MEKONG', platform: 'ebay', count: 82 },
    { accountSource: 'ecwid', platform: 'ecwid', count: 480 },
    { accountSource: 'ECWID', platform: 'ecwid', count: 8 },
    { accountSource: 'Walmart', platform: 'walmart', count: 109 },
    { accountSource: 'Manual', platform: null, count: 60 },
  ],
};

const platformOf: PlatformOf = (source) => {
  const s = (source ?? '').trim().toLowerCase();
  if (['ebay', 'mekong'].includes(s)) return 'ebay';
  if (['amazon', 'ecwid', 'walmart', 'shopify'].includes(s)) return s;
  return null;
};

let nextId = 1000;
function order(over: Partial<ShipStationV1Order> = {}): ShipStationV1Order {
  nextId += 1;
  return {
    orderId: nextId,
    orderNumber: String(nextId),
    orderDate: '2026-09-20T10:00:00.0000000',
    modifyDate: '2026-09-20T10:00:00.0000000',
    orderStatus: 'awaiting_shipment',
    customerId: 77,
    customerUsername: 'buyer',
    customerEmail: 'buyer@example.com',
    shipTo: {
      name: 'Ann Buyer',
      phone: '555',
      company: null,
      addressLine1: '1 Main',
      addressLine2: null,
      cityLocality: 'Town',
      stateProvince: 'CA',
      postalCode: '90000',
      countryCode: 'US',
      residential: true,
    },
    billTo: null,
    items: [
      {
        sku: 'SKU-1',
        name: 'Speaker',
        quantity: 1,
        unitPrice: 10,
        weightOz: null,
        lineItemKey: null,
        orderItemId: null,
        upc: null,
        imageUrl: null,
        options: [],
        adjustment: false,
      },
    ],
    orderTotal: 10,
    weight: null,
    storeId: 1,
    marketplace: null,
    orderKey: null,
    createDate: null,
    shipDate: null,
    carrierCode: null,
    serviceCode: null,
    externallyFulfilled: false,
    paymentDate: null,
    shipByDate: null,
    amountPaid: 10,
    taxAmount: 0,
    shippingAmount: 0,
    customerNotes: null,
    internalNotes: null,
    gift: false,
    giftMessage: null,
    requestedShippingService: null,
    dimensions: null,
    mergedOrSplit: false,
    ...over,
  };
}

function existing(id: number, orderId: string, accountSource: string | null, over: Partial<ExistingOrderRow> = {}): ExistingOrderRow {
  return {
    id,
    orderId,
    itemNumber: 'B0ASIN',
    productTitle: 'Marketplace title',
    quantity: '1',
    sku: 'SKU-1',
    condition: 'New',
    notes: '',
    customerId: 5,
    shipmentId: null,
    accountSource,
    status: 'unassigned',
    saleAmount: '10.00',
    currency: 'USD',
    ...over,
  };
}

const attributions = buildStoreAttributions(STORES, CATALOG);

function plan(orders: ShipStationV1Order[], rows: ExistingOrderRow[] = [], ignored: string[] = []) {
  const rowsByNumber = new Map<string, ExistingOrderRow[]>();
  for (const r of rows) rowsByNumber.set(r.orderId!, [...(rowsByNumber.get(r.orderId!) ?? []), r]);
  return planShipStationOrders(orders, { attributions, rowsByNumber, platformOf, ignored: new Set(ignored) });
}

test('stores map to the platform spelling the org already uses; ShipStation plumbing is unattributed', () => {
  const source = (id: number) => {
    const a = attributeStore(id, attributions);
    return a.kind === 'platform' ? a.accountSource : `unattributed`;
  };
  assert.equal(source(1), 'Amazon', 'the most-used Amazon spelling, not the slug');
  assert.equal(source(2), 'eBay', 'store grain folds to the platform unless explicitly bound');
  assert.equal(source(3), 'ecwid', 'Ecwid by Lightspeed is the ecwid platform');
  assert.equal(source(4), 'shopify', 'a platform the org has no orders for yet is its slug');
  assert.equal(source(5), 'Manual', 'ShipStation Manual Orders is the org\'s manual channel');
  assert.equal(source(6), 'unattributed');
  assert.equal(source(99), 'unattributed', 'a store missing from /stores is never guessed');
  assert.equal(attributeStore(null, attributions).kind, 'unattributed');
});

test('a store link wins over the marketplace: its account, else the linked platform in the org spelling', () => {
  const bound = buildStoreAttributions(STORES, {
    ...CATALOG,
    bindings: new Map([
      [2, { platform: 'ebay', accountSource: 'MEKONG' }],
      // Shopify store re-pointed by the operator at the existing Ecwid platform.
      [4, { platform: 'ecwid', accountSource: null }],
    ]),
  });
  const mekong = attributeStore(2, bound);
  assert.equal(mekong.kind === 'platform' && mekong.accountSource, 'MEKONG');
  assert.equal(mekong.kind === 'platform' && mekong.via, 'binding');
  const relinked = attributeStore(4, bound);
  assert.equal(relinked.kind === 'platform' && relinked.platform, 'ecwid');
  assert.equal(relinked.kind === 'platform' && relinked.accountSource, 'ecwid', 'the org spelling, not "shopify"');
});

test('canonical line: never a "ShipStation order" title; all lines summarized; notes, gift, service and bill-to kept', () => {
  const two = toCanonicalLine(
    [
      order({
        orderNumber: '500',
        items: [
          { ...order().items[0], name: 'Speaker', quantity: 2 },
          { ...order().items[0], sku: 'SKU-2', name: 'Cable', quantity: 3 },
          { ...order().items[0], sku: null, name: 'Discount', quantity: 1, unitPrice: -1, adjustment: true },
        ],
        customerNotes: 'leave at door',
        gift: true,
        giftMessage: 'Enjoy',
        requestedShippingService: 'Priority',
        billTo: { ...order().shipTo!, name: 'Bill Payer', addressLine1: '9 Bill St' },
      }),
    ],
    'Amazon',
  );
  assert.equal(two.productTitle, 'Speaker (+1 more)', 'adjustments are not products');
  assert.equal(two.quantity, '5');
  assert.equal(two.accountSource, 'Amazon');
  assert.match(two.notes, /Buyer note: leave at door/);
  assert.match(two.notes, /Gift: Enjoy/);
  assert.match(two.notes, /Requested service: Priority/);
  assert.equal(two.buyer?.billTo?.address1, '9 Bill St');
  assert.equal(two.buyer?.email, 'buyer@example.com');
  assert.equal(two.buyer?.channel, 'shipstation', 'the customer id stays keyed to ShipStation, not the platform');

  const empty = toCanonicalLine([order({ orderNumber: '100602', items: [], orderTotal: 0 })], 'Manual');
  assert.equal(empty.productTitle, '', 'no invented title for an order ShipStation holds no items for');
  assert.equal(empty.saleAmount, null, 'a 0 total with nothing priced is unknown, not free');
});

test('canonical line: duplicate copies ship when one ships; a real split only when every part does', () => {
  const copies = [order({ orderNumber: 'D', orderStatus: 'awaiting_shipment' }), order({ orderNumber: 'D', orderStatus: 'shipped' })];
  assert.equal(toCanonicalLine(copies, 'Manual').status, 'shipped');
  const split = copies.map((o) => ({ ...o, mergedOrSplit: true }));
  assert.equal(toCanonicalLine(split, 'Manual').status, 'unassigned');
});

test('plan: new → import; same-platform row → enrich or unchanged; no ShipStation row is ever written as "shipstation"', () => {
  const fresh = order({ orderNumber: 'N1', storeId: 1 });
  const known = order({ orderNumber: 'K1', storeId: 1, orderStatus: 'shipped' });
  const idle = order({ orderNumber: 'K2', storeId: 7, customerId: null, customerEmail: null, shipTo: null, customerUsername: null });
  const { planned, counts } = plan(
    [fresh, known, idle],
    [
      existing(10, 'K1', 'Amazon'),
      existing(11, 'K2', 'Walmart', { status: 'unassigned' }),
    ],
  );
  const byNumber = Object.fromEntries(planned.map((p) => [p.orderNumber, p.plan]));
  assert.deepEqual(byNumber.N1, { outcome: 'import', accountSource: 'Amazon' });
  assert.equal(byNumber.K1.outcome, 'enrich', 'the untouched status moves to shipped');
  assert.equal(byNumber.K2.outcome, 'unchanged');
  assert.equal(counts.imported, 1);
  assert.equal(counts.enriched, 1);
  assert.equal(counts.skipped, 1);
  for (const p of planned) assert.notEqual(p.line?.accountSource?.toLowerCase(), 'shipstation');
});

test('plan: another spelling of the platform is adopted (source kept); a legacy "shipstation" row is claimed', () => {
  const { planned, counts } = plan(
    [order({ orderNumber: 'A1', storeId: 3 }), order({ orderNumber: 'L1', storeId: 3 })],
    [existing(20, 'A1', 'ECWID'), existing(21, 'L1', 'shipstation', { productTitle: 'ShipStation order L1' })],
  );
  const a1 = planned.find((p) => p.orderNumber === 'A1')!.plan;
  const l1 = planned.find((p) => p.orderNumber === 'L1')!.plan;
  assert.equal(a1.outcome !== 'skip' && a1.outcome !== 'quarantine' && a1.outcome !== 'import' && a1.match, 'adopted');
  assert.equal(l1.outcome, 'enrich', 'a claim always writes (the re-key)');
  assert.equal(l1.outcome === 'enrich' && l1.match, 'claimed');
  assert.equal(counts.reasons['match.claimed'], 1);
});

test('plan: unknown store and cross-platform numbers are quarantined with the evidence; cancelled/unpaid/ignored skip', () => {
  const { planned, counts } = plan(
    [
      order({ orderNumber: 'U1', storeId: 6 }),
      order({ orderNumber: 'X1', storeId: 1 }),
      order({ orderNumber: 'C1', orderStatus: 'cancelled' }),
      order({ orderNumber: 'P1', orderStatus: 'awaiting_payment' }),
      order({ orderNumber: 'I1' }),
    ],
    [existing(30, 'X1', 'eBay'), existing(31, 'X1', 'Walmart')],
    ['I1'],
  );
  const get = (n: string) => planned.find((p) => p.orderNumber === n)!;
  assert.equal(get('U1').plan.outcome, 'quarantine');
  assert.equal(get('U1').plan.outcome === 'quarantine' && get('U1').plan.reason, 'shipstation_unknown_store');
  const x1 = get('X1').plan;
  assert.equal(x1.outcome === 'quarantine' && x1.reason, 'shipstation_ambiguous_match');
  assert.deepEqual(x1.outcome === 'quarantine' && x1.candidateSources, ['eBay', 'Walmart']);
  assert.equal(get('X1').line, null, 'nothing is written for a quarantined order');
  assert.equal(get('C1').plan.outcome === 'skip' && get('C1').plan.reason, 'cancelled');
  assert.equal(get('I1').plan.outcome === 'skip' && get('I1').plan.reason, 'ignored_exception');
  assert.equal(get('P1').plan.outcome === 'skip' && get('P1').plan.reason, 'awaiting_payment', 'unpaid never reaches To-ship');
  assert.equal(counts.quarantined, 2);
  assert.equal(counts.skipped, 3);
});

test('backfill windows cover the span once, oldest first', () => {
  const w = backfillWindows(new Date('2026-01-01T00:00:00Z'), new Date('2026-03-15T00:00:00Z'), 30);
  assert.equal(w.length, 3);
  assert.equal(w[0].start.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(w[2].end.toISOString(), '2026-03-15T00:00:00.000Z', 'the last window is clipped to the end');
  for (let i = 1; i < w.length; i++) assert.equal(w[i].start.getTime(), w[i - 1].end.getTime(), 'no gap, no overlap');
});

test('resume: continues at the checkpointed window + page of its phase; later phases start over, earlier ones are done', () => {
  const w = backfillWindows(new Date('2026-01-01T00:00:00Z'), new Date('2026-04-01T00:00:00Z'), 30);
  assert.deepEqual(resumeFrom(w, null, 'orders'), { windowIndex: 0, page: 1 });
  const mid = { phase: 'orders' as const, windowStart: w[1].start, page: 3 };
  assert.deepEqual(resumeFrom(w, mid, 'orders'), { windowIndex: 1, page: 3 });
  assert.deepEqual(resumeFrom(w, mid, 'shipments'), { windowIndex: 0, page: 1 });
  const inShipments = { phase: 'shipments' as const, windowStart: w[2].start, page: 2 };
  assert.deepEqual(resumeFrom(w, inShipments, 'orders'), { windowIndex: w.length, page: 1 }, 'orders already done');
  assert.deepEqual(resumeFrom(w, inShipments, 'shipments'), { windowIndex: 2, page: 2 });
});
