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

  it('sorts Late by derived days-late — DESC = most overdue first', () => {
    const earlier = row({ id: 1, deadline_at: '2026-07-01T00:00:00.000Z' });
    const later = row({ id: 2, deadline_at: '2026-07-10T00:00:00.000Z' });
    // Earlier commitment ⇒ larger days-late. DESC (column default) leads with it.
    assert.ok(compareQueueColumnRows(earlier, later, 'age', 'desc') < 0);
    assert.ok(compareQueueColumnRows(earlier, later, 'age', 'asc') > 0);
  });

  it('sorts deadline-less rows last (they show em dash, not a days-late face)', () => {
    const dated = row({ id: 1, deadline_at: '2026-07-01T00:00:00.000Z' });
    const missing = row({ id: 2, deadline_at: null, ship_by_date: null });
    assert.ok(compareQueueColumnRows(dated, missing, 'age', 'desc') < 0);
    assert.ok(compareQueueColumnRows(dated, missing, 'age', 'asc') < 0);
  });

  it('sorts qty numerically', () => {
    const one = row({ id: 1, quantity: 1 });
    const ten = row({ id: 2, quantity: 10 });
    assert.ok(compareQueueColumnRows(one, ten, 'qty', 'asc') < 0);
    assert.ok(compareQueueColumnRows(one, ten, 'qty', 'desc') > 0);
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
