/** The receiving family's mounted column model IS the shared compound skeleton — the flat sibling it used to be compared against is deleted. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RECEIVING_COMPOUND_COLUMNS } from '@/lib/receiving/receiving-grid-layout';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';

describe('compound column model', () => {
  it('is the shared skeleton, in the skeleton’s order', () => {
    // Bound slot tracks (`status:N` / `subtitle:N`) are layout, not skeleton —
    // the product layout ships none, so the two lists are equal today and this
    // stays honest if a fact is bound later.
    const chrome = RECEIVING_COMPOUND_COLUMNS.map((c) => c.key).filter(
      (key) => !key.startsWith('status:') && !key.startsWith('subtitle:'),
    );
    assert.deepEqual(chrome, [...COMPOUND_COLUMN_KEYS]);
  });

  it('ends with the sole 1fr slack track', () => {
    const last = RECEIVING_COMPOUND_COLUMNS[RECEIVING_COMPOUND_COLUMNS.length - 1];
    assert.equal(last.key, '_fill');
    const fillish = RECEIVING_COMPOUND_COLUMNS.filter((c) => String(c.width).includes('1fr'));
    assert.equal(fillish.length, 1, 'exactly one track may own the slack');
  });

  it('freezes a contiguous prefix', () => {
    // gridFrozenLeft sums the widths of preceding frozen columns, so a gap in
    // the frozen prefix silently mis-positions the sticky pane.
    const frozen = RECEIVING_COMPOUND_COLUMNS.map((c) => Boolean(c.frozen));
    const firstUnfrozen = frozen.indexOf(false);
    assert.ok(firstUnfrozen > 0, 'at least one frozen identity column');
    assert.ok(!frozen.slice(firstUnfrozen).includes(true), 'frozen columns must be a prefix');
  });

  it('keeps the thumbnail track frozen with the identity pane', () => {
    const thumb = RECEIVING_COMPOUND_COLUMNS.find((c) => c.key === 'thumb')!;
    assert.ok(thumb.frozen, 'the image is part of the pinned row handle');
  });

  it('lets an operator drag every DATA track', () => {
    // The two gutters (`select`, `thumb`) are excluded on purpose: both are
    // fixed squares, and a drag could only crop one or leave dead space.
    const resizable = RECEIVING_COMPOUND_COLUMNS.filter((c) => c.resizable).map((c) => c.key);
    for (const key of resizable) {
      assert.ok(key !== 'select' && key !== 'thumb', `${key} is a gutter, not a data track`);
    }
    assert.ok(resizable.includes('item'), 'the title track must be draggable');
    assert.ok(resizable.includes('fulfillment'), 'the identity track must be draggable');
  });

  it('never offers sort on the select gutter', () => {
    const select = RECEIVING_COMPOUND_COLUMNS.find((c) => c.key === 'select')!;
    assert.equal(select.sortable, false, 'select is chrome, not a fact');
  });
});
