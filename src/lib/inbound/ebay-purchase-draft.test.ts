import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import type { BuyerPurchaseLine } from '@/lib/ebay/purchase-client';
import { mapTradingOrderToBuyerLines } from '@/lib/ebay/purchase-client';
import { ebayPurchaseDrafts, ebayPurchaseToInboundOrderDraft } from './ebay-purchase-draft';
import { inboundOrderDraftSchema, inboundOrderMissing } from './inbound-order-draft';
import { ingestInboundOrderInTx, type IngestInboundOrderDeps } from './ingest-inbound-order';
import type { TxClient } from './purchase-links';

const ORG = '00000000-0000-0000-0000-00000000eeee' as OrgId;
const SYNC = { origin: 'sync' as const, source: 'ebay', staffId: null };

/** A Trading GetOrders buyer order with two transactions; tracking optional. */
function tradingOrder(tracking: string | null): Record<string, unknown> {
  return {
    OrderID: '12-34567-89012',
    OrderStatus: 'Completed',
    SellerUserID: 'parts_seller',
    CreatedTime: '2026-09-30T22:10:00.000Z',
    CheckoutStatus: { Status: 'Complete' },
    ...(tracking
      ? { ShippingDetails: { ShipmentTrackingDetails: [{ ShipmentTrackingNumber: tracking, ShippingCarrierUsed: 'USPS' }] } }
      : {}),
    TransactionArray: {
      Transaction: [
        {
          OrderLineItemID: '111222333-444555666',
          QuantityPurchased: 2,
          TransactionPrice: { '#text': '24.99', '@_currencyID': 'USD' },
          Item: { ItemID: '111222333', Title: 'Bose SoundLink', SKU: 'BOSE-SL', ViewItemURL: 'https://www.ebay.com/itm/111222333' },
        },
        {
          OrderLineItemID: '777888999-000111222',
          QuantityPurchased: 1,
          TransactionPrice: { '#text': '5', '@_currencyID': 'USD' },
          Item: { ItemID: '777888999', Title: 'Aux cable' },
        },
      ],
    },
  };
}

test('a multi-line eBay purchase maps to one complete PO draft', () => {
  const draft = ebayPurchaseToInboundOrderDraft(mapTradingOrderToBuyerLines(tradingOrder('9400111899223344556677')), 'USAV-Buyer');

  assert.equal(inboundOrderDraftSchema.safeParse(draft).success, true, 'valid against the one contract');
  assert.deepEqual(inboundOrderMissing(draft), [], 'nothing missing — lands without a person');
  assert.equal(draft.type, 'PO');
  assert.equal(draft.platform, 'ebay');
  assert.equal(draft.orderNumber, '12-34567-89012');
  assert.equal(draft.vendor, 'parts_seller');
  assert.equal(draft.accountName, 'USAV-Buyer');
  assert.equal(draft.priority, 'auto');
  assert.equal(draft.orderDate, '2026-09-30');
  assert.equal(draft.currency, 'USD');
  assert.deepEqual(draft.tracking, [{ number: '9400111899223344556677', carrier: 'USPS' }], 'order-level tracking once, not per line');
  assert.deepEqual(draft.sourceStatus, { order: 'Completed', payment: 'Complete' });
  assert.deepEqual(
    draft.lines.map((l) => [l.lineKey, l.title, l.sku, l.quantity, l.unitCostCents, l.itemNumber, l.listingUrl]),
    [
      ['111222333-444555666', 'Bose SoundLink', 'BOSE-SL', 2, 2499, '111222333', 'https://www.ebay.com/itm/111222333'],
      ['777888999-000111222', 'Aux cable', '', 1, 500, '777888999', 'https://www.ebay.com/itm/777888999'],
    ],
  );
});

test('grouping: lines split by order, a re-paged transaction collapses, a titleless line still has identity', () => {
  const lines: BuyerPurchaseLine[] = [
    { sourceOrderId: 'A', sourceLineItemId: 'A-1', itemName: 'old title', quantity: 1 },
    { sourceOrderId: 'B', itemId: '42', quantity: 3 },
    { sourceOrderId: 'A', sourceLineItemId: 'A-1', itemName: 'new title', quantity: 1, trackingNumber: '1Z999AA10123456784' },
    { sourceOrderId: '  ' },
  ];
  const drafts = ebayPurchaseDrafts(lines, null);
  assert.deepEqual(drafts.map((d) => d.orderId), ['A', 'B']);
  assert.deepEqual(drafts[0].draft.lines.map((l) => l.title), ['new title'], 'last copy of a line key wins');
  assert.equal(drafts[0].draft.tracking.length, 1);
  assert.equal(drafts[1].draft.lines[0].title, 'eBay item 42');
  assert.equal(drafts[1].draft.lines[0].quantity, 3);
  assert.deepEqual(drafts[1].draft.tracking, []);
  assert.equal(drafts[1].draft.currency, 'USD');
  assert.equal(drafts[1].draft.sourceStatus, undefined);
});

/** Stateful tx fake: one inbound_order row per identity, line identity by (order, line_key). */
function store() {
  const orders = new Map<string, { id: number; hash: string }>();
  const lineIds = new Map<string, number>();
  const registered: string[] = [];
  const ingested: Array<Record<string, unknown>> = [];
  let identityKey = '';
  const client: TxClient = {
    query: (async (text: string, params: ReadonlyArray<unknown> = []) => {
      if (/FROM inbound_order\s+WHERE/.test(text)) {
        identityKey = params.slice(1, 4).join(':');
        const row = orders.get(identityKey);
        return { rows: row ? [{ id: row.id, content_hash: row.hash }] : [], rowCount: row ? 1 : 0 };
      }
      if (/INSERT INTO suppliers/.test(text)) return { rows: [{ id: 3 }], rowCount: 1 };
      if (/INSERT INTO inbound_order/.test(text)) {
        const prior = orders.get(identityKey);
        const id = prior?.id ?? orders.size + 1;
        orders.set(identityKey, { id, hash: String(params[13]) });
        return { rows: [{ id, created: !prior }], rowCount: 1 };
      }
      if (/FROM receiving_line\s+WHERE organization_id = \$1 AND inbound_order_id/.test(text)) {
        const rows = [...lineIds].map(([key, id]) => ({ id, line_key: key.split('|')[1], receiving_id: null }));
        return { rows, rowCount: rows.length };
      }
      return { rows: [], rowCount: 0 };
    }) as TxClient['query'],
  };
  const deps: IngestInboundOrderDeps = {
    registerShipment: async (tracking) => {
      registered.push(tracking);
      return 77;
    },
    ingestPurchase: (async (_org: OrgId, input: Record<string, unknown>) => {
      ingested.push(input);
      const key = `${input.inboundOrderId}|${input.lineKey}`;
      const prior = lineIds.get(key);
      const id = prior ?? 100 + lineIds.size;
      lineIds.set(key, id);
      return { receivingLineId: id, receivingId: input.shipmentId ? 12 : null, created: prior == null, platformAccountId: null, sourceType: 'ebay', sourceOrderId: String(input.sourceOrderId) };
    }) as unknown as IngestInboundOrderDeps['ingestPurchase'],
    upsertPurchaseLink: (async () => ({})) as unknown as IngestInboundOrderDeps['upsertPurchaseLink'],
    recordEquivalence: (async () => ({})) as unknown as IngestInboundOrderDeps['recordEquivalence'],
  };
  return { client, deps, orders, lineIds, registered, ingested };
}

test('missing tracking, then tracking added on a later sync → the same order updates, never duplicates', async () => {
  const s = store();
  const before = ebayPurchaseToInboundOrderDraft(mapTradingOrderToBuyerLines(tradingOrder(null)), 'USAV-Buyer');
  const after = ebayPurchaseToInboundOrderDraft(mapTradingOrderToBuyerLines(tradingOrder('9400111899223344556677')), 'USAV-Buyer');

  const first = await ingestInboundOrderInTx(s.client, ORG, before, SYNC, s.deps);
  assert.equal(first.created, true);
  assert.equal(first.unchanged, false);
  assert.deepEqual(first.lines.map((l) => l.created), [true, true]);
  assert.deepEqual(s.registered, [], 'no tracking yet → no shipment');

  const second = await ingestInboundOrderInTx(s.client, ORG, after, SYNC, s.deps);
  assert.equal(second.inboundOrderId, first.inboundOrderId, 'same order identity');
  assert.equal(second.created, false);
  assert.equal(second.unchanged, false, 'tracking changed the content → re-landed');
  assert.deepEqual(second.lines.map((l) => [l.receivingLineId, l.created]), first.lines.map((l) => [l.receivingLineId, false]), 'same lines, updated in place');
  assert.deepEqual(s.registered, ['9400111899223344556677']);
  assert.ok(s.ingested.slice(2).every((i) => i.trackingNumber === '9400111899223344556677' && i.shipmentId === 77));
  assert.ok(s.ingested.every((i) => i.status === 'Completed' && i.paymentStatus === 'Complete'), 'eBay status reaches the mirror + facts');

  const third = await ingestInboundOrderInTx(s.client, ORG, after, SYNC, s.deps);
  assert.equal(third.unchanged, true, 'the overlap re-read of the same content writes nothing');
  assert.equal(s.ingested.length, 4);
  assert.equal(s.orders.size, 1);
  assert.equal(s.lineIds.size, 2);
});
