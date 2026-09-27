import assert from 'node:assert/strict';
import test from 'node:test';
import type { OrgId } from '@/lib/tenancy/constants';
import { deskRowFromCsvRecord } from './desk-csv';
import { draftsFromDeskRows } from './import-batch';

const ORG = '00000000-0000-4000-8000-000000000001' as OrgId;

function amazonReturn(overrides: Record<string, string> = {}) {
  return deskRowFromCsvRecord({
    'Order ID': '111-222-333',
    'Return request status': 'Approved',
    'Amazon RMA ID': 'RMA1',
    'Tracking ID': '1Z999AA10123456784',
    ASIN: 'B0HITSKU01',
    'Item Name': 'Hit Product',
    'Return quantity': '1',
    'Return Reason': 'UNWANTED_ITEM',
    ...overrides,
  });
}

const noCatalog = async () => null;

test('rows of one order become one draft with one line each; other orders stay apart', async () => {
  const rows = [
    deskRowFromCsvRecord({ order_id: 'PO-9', platform: 'goodwill', sku: 'A', qty: '2', tracking: '1Z999AA10123456784' }),
    deskRowFromCsvRecord({ order_id: ' po-9 ', platform: 'goodwill', sku: 'B', qty: '1', tracking: '1Z999AA10123456784' }),
    deskRowFromCsvRecord({ order_id: 'PO-9', platform: 'walmart', sku: 'C', qty: '1' }),
  ];
  const { orders, skipped } = await draftsFromDeskRows(ORG, rows, noCatalog);

  assert.equal(skipped.length, 0);
  assert.equal(orders.length, 2, 'same number on another platform is another order');
  const goodwill = orders.find((o) => o.draft.platform === 'goodwill')!;
  assert.deepEqual(goodwill.rows, [0, 1]);
  assert.deepEqual(goodwill.draft.lines.map((l) => [l.sku, l.quantity]), [['A', 2], ['B', 1]]);
  assert.equal(goodwill.draft.tracking.length, 1, 'a shared tracking number is listed once');
});

test('cancelled Amazon returns are skipped, never drafted', async () => {
  const { orders, skipped } = await draftsFromDeskRows(ORG, [amazonReturn({ 'Return request status': 'Cancelled' })], async () => {
    throw new Error('must not resolve a skipped row');
  });
  assert.equal(orders.length, 0);
  assert.deepEqual(skipped, [{ row: 0, reason: 'cancelled' }]);
});

test('an Amazon return whose ASIN is the catalog SKU lands on that catalog item; a miss still lands by text', async () => {
  const hit = await draftsFromDeskRows(ORG, [amazonReturn()], async (_org, needle) =>
    needle === 'B0HITSKU01' ? { id: 42, sku: 'B0HITSKU01', product_title: 'Catalog Title' } : null,
  );
  const line = hit.orders[0].draft.lines[0];
  assert.equal(hit.orders[0].draft.type, 'RETURN');
  assert.equal(line.skuCatalogId, 42);
  assert.equal(line.title, 'Hit Product');

  const miss = await draftsFromDeskRows(ORG, [amazonReturn()], noCatalog);
  assert.equal(miss.orders[0].draft.lines[0].skuCatalogId, null);
  assert.equal(miss.orders[0].draft.tracking[0].number, '1Z999AA10123456784', 'tracking still lands for the door scan');
});
