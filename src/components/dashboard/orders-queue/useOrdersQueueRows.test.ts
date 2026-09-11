import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildOrdersQueueRows } from '@/components/dashboard/orders-queue/useOrdersQueueRows';
import type { ShippedOrder } from '@/lib/neon/orders-queries';

function line(over: Partial<ShippedOrder> = {}): ShippedOrder {
  return {
    id: 1,
    order_id: '111-1',
    product_title: 'Widget',
    ...over,
  } as ShippedOrder;
}

describe('buildOrdersQueueRows', () => {
  it('paints every feed row — undated and in-transit included', () => {
    const records = [
      line({ id: 1, order_id: 'a', deadline_at: '2026-09-08T12:00:00.000Z' }),
      line({ id: 2, order_id: 'b', deadline_at: null, created_at: null, ship_by_date: null }),
      line({
        id: 3,
        order_id: 'c',
        deadline_at: '2026-09-08T12:00:00.000Z',
        latest_status_category: 'IN_TRANSIT',
      }),
      line({ id: 4, order_id: 'd' }),
      line({ id: 5, order_id: 'e', created_at: '2026-09-01T00:00:00.000Z' }),
      line({ id: 6, order_id: 'f' }),
      line({ id: 7, order_id: 'g' }),
      line({ id: 8, order_id: 'h' }),
      line({ id: 9, order_id: 'i' }),
    ];
    const built = buildOrdersQueueRows({
      records,
      sort: 'deadline',
      queueMode: 'fulfillment',
    });
    assert.equal(built.displayedRecords.length, 9);
    assert.equal(built.totalCount, 9);
    assert.equal(built.visibleRecords.length, 9);
  });
});
