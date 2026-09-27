/**
 * DB-free unit tests for Search order resolve mapping.
 * Run: npx tsx --test src/lib/search/resolve-search-order.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { toShippedOrderFromApi } from './resolve-search-order';

test('toShippedOrderFromApi: maps lookup-shaped payload without dashboard row', () => {
  const order = toShippedOrderFromApi({
    id: 991,
    order_id: '05-14897-15602',
    product_title: 'Bose Wave',
    sku: 'WAVE-1',
    condition: 'USED_GOOD',
    account_source: 'ebay',
    tracking_numbers: ['9400111899561234567890'],
    serials: ['SN-1', 'SN-2'],
    customer_id: 7,
    ship_by_date: '2026-07-21T00:00:00.000Z',
    created_at: '2026-07-01T00:00:00.000Z',
    notes: null,
    packer_id: 4,
  });
  assert.ok(order);
  assert.equal(order!.id, 991);
  assert.equal(order!.order_id, '05-14897-15602');
  assert.equal(order!.product_title, 'Bose Wave');
  assert.equal(order!.shipping_tracking_number, '9400111899561234567890');
  assert.deepEqual(order!.tracking_numbers, ['9400111899561234567890']);
  assert.equal(order!.serial_number, 'SN-1, SN-2');
  assert.equal(order!.packer_id, 4);
  assert.equal(order!.row_source, 'order');
});

test('toShippedOrderFromApi: rejects missing id or order_id', () => {
  assert.equal(toShippedOrderFromApi(null), null);
  assert.equal(toShippedOrderFromApi({ order_id: '05-14897-15602' }), null);
  assert.equal(toShippedOrderFromApi({ id: 1 }), null);
  assert.equal(toShippedOrderFromApi({ id: 0, order_id: 'x' }), null);
});

test('toShippedOrderFromApi: GET /api/orders/:id raw row shape', () => {
  const order = toShippedOrderFromApi({
    id: 42,
    order_id: '111-6350504-7603458',
    product_title: null,
    sku: null,
    condition: null,
    shipping_tracking_number: '1Z999',
    serial_number: 'ABC',
    account_source: 'amazon',
  });
  assert.ok(order);
  assert.equal(order!.product_title, 'Order');
  assert.equal(order!.shipping_tracking_number, '1Z999');
  assert.deepEqual(order!.tracking_numbers, ['1Z999']);
  assert.equal(order!.serial_number, 'ABC');
});
