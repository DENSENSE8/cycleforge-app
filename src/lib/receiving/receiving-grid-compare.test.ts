import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareReceivingGridRows } from '@/lib/receiving/receiving-grid-compare';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

function row(partial: Partial<ReceivingLineRow> & { id: number }): ReceivingLineRow {
  return {
    quantity_received: 1,
    quantity_expected: 1,
    ...partial,
  } as ReceivingLineRow;
}

describe('compareReceivingGridRows', () => {
  it('sorts date desc by unboxed_at (newest first)', () => {
    const a = row({ id: 1, unboxed_at: '2026-07-20T10:00:00Z' });
    const b = row({ id: 2, unboxed_at: '2026-07-22T12:00:00Z' });
    assert.ok(compareReceivingGridRows(a, b, 'date', 'desc', 'unboxed') > 0);
    assert.ok(compareReceivingGridRows(a, b, 'date', 'asc', 'unboxed') < 0);
  });

  // Same-day rows separate by the TIME half of `date` — the assertion the old
  // `stage` column's own case used to carry, kept after that track was deleted
  // (2026-08-02) so the intra-day ordering stays pinned.
  it('sorts date desc within one day (clock, not just the civil key)', () => {
    const a = row({ id: 1, unboxed_at: '2026-07-22T10:00:00Z' });
    const b = row({ id: 2, unboxed_at: '2026-07-22T12:00:00Z' });
    assert.ok(compareReceivingGridRows(a, b, 'date', 'desc', 'unboxed') > 0);
    assert.ok(compareReceivingGridRows(a, b, 'date', 'asc', 'unboxed') < 0);
  });

  it('sorts title case-insensitively', () => {
    const a = row({ id: 1, item_name: 'Bose Wave' });
    const b = row({ id: 2, item_name: 'apple tv' });
    assert.ok(compareReceivingGridRows(a, b, 'title', 'asc') > 0);
  });

  it('falls back to id on ties', () => {
    const a = row({ id: 1, item_name: 'Same' });
    const b = row({ id: 2, item_name: 'Same' });
    assert.equal(compareReceivingGridRows(a, b, 'title', 'asc'), -1);
  });

  it('sorts price numerically (missing as 0)', () => {
    const a = row({ id: 1, unit_price: '10.00' });
    const b = row({ id: 2, unit_price: '25.50' });
    const bare = row({ id: 3, unit_price: null });
    assert.ok(compareReceivingGridRows(a, b, 'price', 'asc') < 0);
    assert.ok(compareReceivingGridRows(a, b, 'price', 'desc') > 0);
    assert.ok(compareReceivingGridRows(bare, a, 'price', 'asc') < 0);
  });
});
