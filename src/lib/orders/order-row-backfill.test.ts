/**
 * DB-free: which `orders` columns a planned backfill actually changes — the
 * import record's `filled_fields`.
 * Run: npx tsx --test src/lib/orders/order-row-backfill.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { filledOrderColumns, planOrderRowBackfill, type BackfillIncoming, type BackfillRow } from './order-row-backfill';

const row = (over: Partial<BackfillRow> = {}): BackfillRow => ({
  orderId: '111',
  itemNumber: '',
  productTitle: 'Widget',
  quantity: '1',
  sku: '',
  condition: '',
  notes: '',
  customerId: null,
  shipmentId: null,
  accountSource: 'eBay',
  status: 'unassigned',
  skuCatalogId: null,
  saleAmount: null,
  currency: null,
  ...over,
});

const incoming = (over: Partial<BackfillIncoming> = {}): BackfillIncoming => ({
  orderId: '111',
  itemNumber: 'ITEM1',
  productTitle: 'Widget',
  sku: 'SKU1',
  skuCatalogId: 956,
  quantity: '1',
  condition: 'Used',
  notes: '',
  status: null,
  saleAmount: '19.99',
  currency: 'USD',
  accountSource: 'eBay',
  customerId: 12,
  shipmentIds: [77],
  ...over,
});

const fill = { titleAuthoritative: false, statusAuthoritative: false, sourceWrite: 'fill' as const };

test('every blank the plan fills is named by its orders column', () => {
  const existing = row();
  const { values } = planOrderRowBackfill(existing, incoming(), fill);
  assert.deepEqual(filledOrderColumns(existing, values).sort(), [
    'condition',
    'currency',
    'customer_id',
    'item_number',
    'sale_amount',
    'shipment_id',
    'sku',
    'sku_catalog_id',
  ]);
});

test('an authoritative title re-sent unchanged is no fill; a changed one is', () => {
  const existing = row({ itemNumber: 'ITEM1', sku: 'SKU1', condition: 'Used', customerId: 12, shipmentId: 77, saleAmount: '19.99', currency: 'USD', skuCatalogId: 956 });
  const authoritative = { ...fill, titleAuthoritative: true };
  const same = planOrderRowBackfill(existing, incoming(), authoritative);
  assert.ok('productTitle' in same.values, 'the writer still sends the title');
  assert.deepEqual(filledOrderColumns(existing, same.values), [], 'a re-sync over current data fills nothing');

  const renamed = planOrderRowBackfill(existing, incoming({ productTitle: 'Widget Pro' }), authoritative);
  assert.deepEqual(filledOrderColumns(existing, renamed.values), ['product_title']);
});

test('a marketplace re-key of the aggregator row reports account_source', () => {
  const existing = row({ accountSource: 'shipstation', itemNumber: 'ITEM1', sku: 'SKU1', condition: 'Used', customerId: 12, shipmentId: 77, saleAmount: '19.99', currency: 'USD' });
  const { values } = planOrderRowBackfill(existing, incoming({ skuCatalogId: null }), { ...fill, sourceWrite: 'rekey' });
  assert.deepEqual(filledOrderColumns(existing, values), ['account_source']);
});
