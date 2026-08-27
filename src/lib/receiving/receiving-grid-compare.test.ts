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

/**
 * Org custom columns (`custom:<defKey>`), merged into the model at runtime.
 *
 * Values arrive already typed per their def (see `hydrateCustomFieldMaps`), so
 * these fixtures use real JS types — a number def yields a number, a date def
 * yields an ISO `YYYY-MM-DD` string — which is what the comparator dispatches
 * on.
 */
describe('compareReceivingGridRows — org custom columns', () => {
  const KEY = 'custom:rack_slot';

  it('sorts a number field NUMERICALLY, not lexically', () => {
    // The regression this whole storage shape exists to prevent: as JSON text,
    // "10" sorts between "1" and "2". Typed value columns are what make a
    // custom column comparable down its own track.
    const two = row({ id: 1, customFields: { rack_slot: 2 } });
    const ten = row({ id: 2, customFields: { rack_slot: 10 } });
    assert.ok(compareReceivingGridRows(two, ten, KEY, 'asc') < 0);
    assert.ok(compareReceivingGridRows(two, ten, KEY, 'desc') > 0);
  });

  it('sorts a number field across negatives', () => {
    const low = row({ id: 1, customFields: { rack_slot: -5 } });
    const mid = row({ id: 2, customFields: { rack_slot: 2.5 } });
    assert.ok(compareReceivingGridRows(low, mid, KEY, 'asc') < 0);
  });

  // This is the fixture that actually PINS the numeric branch. `2` vs `10`
  // does not: the string fallback uses `numeric: true` collation, which gets
  // whole numbers right anyway. Decimals are where the two diverge — that
  // collation treats `.` as a SEPARATOR, so it reads "2.5" vs "2.25" as 5 vs
  // 25 and orders them backwards. A weight / cost custom field would silently
  // mis-sort if this ever fell through to string compare.
  it('sorts decimals by VALUE, where numeric collation would invert them', () => {
    const bigger = row({ id: 1, customFields: { rack_slot: 2.5 } });
    const smaller = row({ id: 2, customFields: { rack_slot: 2.25 } });
    assert.ok(compareReceivingGridRows(smaller, bigger, KEY, 'asc') < 0);
    assert.ok(compareReceivingGridRows(smaller, bigger, KEY, 'desc') > 0);
  });

  it('sorts a date field chronologically', () => {
    const early = row({ id: 1, customFields: { rack_slot: '2026-01-05' } });
    const late = row({ id: 2, customFields: { rack_slot: '2026-01-15' } });
    assert.ok(compareReceivingGridRows(early, late, KEY, 'asc') < 0);
    assert.ok(compareReceivingGridRows(early, late, KEY, 'desc') > 0);
  });

  it('sorts a text field case-insensitively', () => {
    const bose = row({ id: 1, customFields: { rack_slot: 'Bose' } });
    const apple = row({ id: 2, customFields: { rack_slot: 'apple' } });
    assert.ok(compareReceivingGridRows(bose, apple, KEY, 'asc') > 0);
  });

  it('sorts a boolean field false before true', () => {
    const no = row({ id: 1, customFields: { rack_slot: false } });
    const yes = row({ id: 2, customFields: { rack_slot: true } });
    assert.ok(compareReceivingGridRows(no, yes, KEY, 'asc') < 0);
  });

  // The deliberate divergence from `date`'s +Infinity behaviour. A custom
  // column is empty on most rows until someone backfills it, so blanks must
  // never take the top of the grid on the first click.
  it('sorts blanks LAST in BOTH directions', () => {
    const filled = row({ id: 1, customFields: { rack_slot: 'A1' } });
    const empty = row({ id: 2, customFields: {} });
    const nulled = row({ id: 3, customFields: { rack_slot: null } });
    const emptyString = row({ id: 4, customFields: { rack_slot: '' } });

    for (const blank of [empty, nulled, emptyString]) {
      assert.ok(compareReceivingGridRows(filled, blank, KEY, 'asc') < 0);
      assert.ok(compareReceivingGridRows(filled, blank, KEY, 'desc') < 0);
      assert.ok(compareReceivingGridRows(blank, filled, KEY, 'asc') > 0);
      assert.ok(compareReceivingGridRows(blank, filled, KEY, 'desc') > 0);
    }
  });

  it('falls back to id on ties, including two blanks', () => {
    const a = row({ id: 1, customFields: { rack_slot: 'same' } });
    const b = row({ id: 2, customFields: { rack_slot: 'same' } });
    assert.equal(compareReceivingGridRows(a, b, KEY, 'asc'), -1);

    const blankA = row({ id: 1, customFields: {} });
    const blankB = row({ id: 2, customFields: {} });
    assert.equal(compareReceivingGridRows(blankA, blankB, KEY, 'asc'), -1);
  });

  // A shared `?colsort=` link outlives the def it names. Degrade to a stable
  // id order rather than throwing on a column that no longer exists.
  it('treats an archived / unknown def key as all-blank, never a throw', () => {
    const a = row({ id: 1, customFields: { rack_slot: 'A1' } });
    const b = row({ id: 2, customFields: { rack_slot: 'B2' } });
    assert.equal(compareReceivingGridRows(a, b, 'custom:gone', 'asc'), -1);
    assert.equal(compareReceivingGridRows(a, b, 'custom:gone', 'desc'), -1);
  });

  it('is unaffected by rows that carry no customFields at all', () => {
    const bare = row({ id: 2 });
    const filled = row({ id: 1, customFields: { rack_slot: 'A1' } });
    assert.ok(compareReceivingGridRows(filled, bare, KEY, 'asc') < 0);
    assert.ok(compareReceivingGridRows(filled, bare, KEY, 'desc') < 0);
  });
});
