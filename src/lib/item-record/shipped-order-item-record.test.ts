import assert from 'node:assert/strict';
import test from 'node:test';

import type { ShippedOrder } from '@/types/orders';
import {
  shippedOrderToItemRecords,
  splitOrderSerials,
} from '@/lib/item-record/shipped-order-item-record';

function order(overrides: Partial<ShippedOrder> = {}): ShippedOrder {
  return {
    id: 42,
    order_id: 'ORD-1',
    product_title: 'Dell Latitude 7420',
    condition: 'USED_GOOD',
    serial_number: '',
    sku: 'LAT7420',
    tester_id: null,
    tested_by: null,
    test_date_time: null,
    packer_id: null,
    packed_by: null,
    packed_at: null,
    packer_photos_url: null,
    tracking_type: null,
    account_source: null,
    notes: '',
    status_history: null,
    created_at: null,
    ...overrides,
  } as ShippedOrder;
}

test('splitOrderSerials trims, drops blanks and tolerates absence', () => {
  assert.deepEqual(splitOrderSerials('A1, B2 ,, C3'), ['A1', 'B2', 'C3']);
  assert.deepEqual(splitOrderSerials(''), []);
  assert.deepEqual(splitOrderSerials(null), []);
  assert.deepEqual(splitOrderSerials(undefined), []);
});

test('maps a sales order onto a single item record', () => {
  const [item, ...rest] = shippedOrderToItemRecords(
    order({ quantity: '2', serial_number: 'SN-1, SN-2' }),
  );
  assert.equal(rest.length, 0);
  assert.equal(item.id, 42);
  assert.equal(item.title, 'Dell Latitude 7420');
  assert.equal(item.sku, 'LAT7420');
  assert.equal(item.conditionGrade, 'USED_GOOD');
  assert.deepEqual(item.serials, ['SN-1', 'SN-2']);
  assert.deepEqual(item.quantity, { expected: 2 });
  assert.equal(item.receiveState, undefined);
});

test('quantity is expected-only — an order counts nothing on the floor', () => {
  const [item] = shippedOrderToItemRecords(order({ quantity: '3' }));
  assert.equal(item.quantity?.counted, undefined);
  assert.equal(item.quantity?.expected, 3);
});

test('unparseable or absent quantity yields a null expected, never NaN', () => {
  for (const quantity of ['', 'many', null, undefined, '0']) {
    const [item] = shippedOrderToItemRecords(order({ quantity: quantity as string | null }));
    assert.equal(item.quantity?.expected, null, `quantity=${String(quantity)}`);
  }
});

test('never claims a unit price — sale_amount is an order total', () => {
  const [item] = shippedOrderToItemRecords(order({ quantity: '1', sale_amount: '499.00' }));
  assert.equal(item.unitPrice, null);
});

test('title falls back to sku, then to the order id', () => {
  assert.equal(shippedOrderToItemRecords(order({ product_title: '' }))[0].title, 'LAT7420');
  assert.equal(
    shippedOrderToItemRecords(order({ product_title: '', sku: '' }))[0].title,
    'Order ORD-1',
  );
});

test('blank sku and condition become null rather than empty strings', () => {
  const [item] = shippedOrderToItemRecords(order({ sku: '  ', condition: '' }));
  assert.equal(item.sku, null);
  assert.equal(item.conditionGrade, null);
});
