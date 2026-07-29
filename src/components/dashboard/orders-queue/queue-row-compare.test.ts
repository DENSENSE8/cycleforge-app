import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { compareQueueColumnRows } from './queue-row-compare';

function row(partial: Partial<ShippedOrder> & { id: number }): ShippedOrder {
  return {
    order_id: '',
    product_title: '',
    quantity: 1,
    condition: 'BRAND_NEW',
    deadline_at: '2026-07-01T12:00:00.000Z',
    created_at: '2026-06-01T12:00:00.000Z',
    account_source: null,
    ...partial,
  } as ShippedOrder;
}

describe('compareQueueColumnRows', () => {
  it('sorts product title A–Z / Z–A', () => {
    const a = row({ id: 1, product_title: 'Alpha Camera' });
    const b = row({ id: 2, product_title: 'Zebra Lens' });
    assert.ok(compareQueueColumnRows(a, b, 'title', 'asc') < 0);
    assert.ok(compareQueueColumnRows(a, b, 'title', 'desc') > 0);
  });

  it('sorts the fused ship-by column ascending = most overdue first', () => {
    const sooner = row({ id: 1, deadline_at: '2026-07-01T00:00:00.000Z' });
    const later = row({ id: 2, deadline_at: '2026-07-10T00:00:00.000Z' });
    // ASC (the column default) leads with the earlier commitment, which is by
    // definition the more overdue row — no direction flip needed for urgency.
    assert.ok(compareQueueColumnRows(sooner, later, 'sla', 'asc') < 0);
    assert.ok(compareQueueColumnRows(sooner, later, 'sla', 'desc') > 0);
  });

  it('sorts deadline-less rows by the same created_at fallback the cell shows', () => {
    // The cell falls back to created_at when there is no deadline, so the sort
    // must use that same instant — otherwise the column orders by a value the
    // operator cannot see.
    const sooner = row({ id: 1, deadline_at: null, created_at: '2026-07-01T00:00:00.000Z' });
    const later = row({ id: 2, deadline_at: null, created_at: '2026-07-10T00:00:00.000Z' });
    assert.ok(compareQueueColumnRows(sooner, later, 'sla', 'asc') < 0);
  });

  it('sorts qty numerically', () => {
    const one = row({ id: 1, quantity: 1 });
    const ten = row({ id: 2, quantity: 10 });
    assert.ok(compareQueueColumnRows(one, ten, 'qty', 'asc') < 0);
    assert.ok(compareQueueColumnRows(one, ten, 'qty', 'desc') > 0);
  });

  it('sorts condition by grade ladder', () => {
    const neu = row({ id: 1, condition: 'BRAND_NEW' });
    const parts = row({ id: 2, condition: 'PARTS' });
    assert.ok(compareQueueColumnRows(neu, parts, 'condition', 'asc') < 0);
  });

  it('puts empty tracking last in both directions', () => {
    const filled = row({
      id: 1,
      tracking_number: '1Z999',
    });
    const empty = row({ id: 2 });
    assert.ok(compareQueueColumnRows(filled, empty, 'tracking', 'asc') < 0);
    assert.ok(compareQueueColumnRows(filled, empty, 'tracking', 'desc') < 0);
  });

  it('tiebreaks on deadline', () => {
    const a = row({ id: 1, product_title: 'Same', deadline_at: '2026-07-01T00:00:00.000Z' });
    const b = row({ id: 2, product_title: 'Same', deadline_at: '2026-07-05T00:00:00.000Z' });
    assert.ok(compareQueueColumnRows(a, b, 'title', 'asc') < 0);
  });
});
