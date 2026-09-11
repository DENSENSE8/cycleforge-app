/**
 *   node --import tsx --test src/lib/orders/filter-painted-orders.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ShippedOrder } from '@/types/orders';
import { filterShippedOrdersByQuery } from './filter-painted-orders';

function row(over: Partial<ShippedOrder> & { id: number }): ShippedOrder {
  return {
    order_id: `09-${over.id}`,
    product_title: 'Bose Wave',
    condition: 'USED_A',
    serial_number: '',
    sku: 'WAVE-1',
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
    ...over,
  };
}

describe('filterShippedOrdersByQuery', () => {
  it('returns the painted set unchanged when the query is empty', () => {
    const rows = [row({ id: 1 }), row({ id: 2 })];
    assert.deepEqual(
      filterShippedOrdersByQuery(rows, '   ').map((r) => r.id),
      [1, 2],
    );
  });

  it('matches order id, sku, title, and tracking on already-shown rows', () => {
    const hit = row({
      id: 9,
      order_id: '12-345678901234',
      product_title: 'Trail Bike',
      sku: 'TB-9',
      shipping_tracking_number: '1Z999AA10123456784',
    });
    const miss = row({ id: 8, order_id: '99-000', product_title: 'Zebra Frame', sku: 'ZF-8' });
    assert.deepEqual(filterShippedOrdersByQuery([hit, miss], '12-345').map((r) => r.id), [9]);
    assert.deepEqual(filterShippedOrdersByQuery([hit, miss], 'trail').map((r) => r.id), [9]);
    assert.deepEqual(filterShippedOrdersByQuery([hit, miss], '1Z999').map((r) => r.id), [9]);
    assert.equal(filterShippedOrdersByQuery([hit, miss], 'nope').length, 0);
  });

  it('keeps sibling lines of a matching order so the fold stays intact', () => {
    const a = row({ id: 1, order_id: '09-100', product_title: 'Wave Radio', sku: 'WAVE' });
    const b = row({ id: 2, order_id: '09-100', product_title: 'Wave Pedestal', sku: 'PED' });
    const other = row({ id: 3, order_id: '09-200', product_title: 'Headphones', sku: 'HP' });
    assert.deepEqual(
      filterShippedOrdersByQuery([a, b, other], 'pedestal').map((r) => r.id),
      [1, 2],
    );
  });
});
