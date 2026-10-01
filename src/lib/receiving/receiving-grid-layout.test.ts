/** The flat `RECEIVING_GRID_COLUMNS` spreadsheet array is DELETED — every desk (Unbox, History, Testing) mounts `RECEIVING_COMPOUND_COLUMNS`. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RECEIVING_COMPOUND_COLUMNS,
  isReceivingGridFrozen,
  isReceivingGridSortable,
} from '@/lib/receiving/receiving-grid-layout';
import { isDataTableChromeColumn } from '@/lib/tables/data-table-header-sort';

describe('isReceivingGridSortable — the one sortability answer', () => {
  it('keeps the fact words sortable and the chrome tracks not', () => {
    assert.equal(isReceivingGridSortable('title'), true);
    assert.equal(isReceivingGridSortable('date'), true);
    assert.equal(isReceivingGridSortable('select'), false);
    assert.equal(isReceivingGridSortable('_fill'), false);
  });

  it('resolves every painted DATA track to a fact it can order by', () => {
    // The mounted model emits TRACK keys; a painted data header that resolved
    // to no fact would offer a click that sorts nothing. Chrome is exempt by
    // the engine's own predicate, not by a per-family flag.
    for (const col of RECEIVING_COMPOUND_COLUMNS) {
      if (isDataTableChromeColumn(col.key)) continue;
      if (col.key === '_fill') continue;
      assert.equal(
        isReceivingGridSortable(col.key),
        true,
        `${col.key} is painted as a data track but resolves to no sort fact`,
      );
    }
  });

  // Custom columns are merged in at runtime, so they can never appear in the static sortable-key list — they are admitted by key SHAPE.
  it('admits org custom columns by key shape', () => {
    assert.equal(isReceivingGridSortable('custom:rack_slot'), true);
    assert.equal(isReceivingGridSortable('custom:vendor_ref'), true);
  });

  it('still rejects a bare prefix or an unknown system key', () => {
    assert.equal(isReceivingGridSortable('custom:'), false);
    assert.equal(isReceivingGridSortable('custom'), false);
    assert.equal(isReceivingGridSortable('not_a_column'), false);
  });
});

describe('isReceivingGridFrozen — the pane the mounted model declares', () => {
  it('freezes exactly the compound model’s frozen prefix', () => {
    for (const col of RECEIVING_COMPOUND_COLUMNS) {
      assert.equal(
        isReceivingGridFrozen(col.key),
        Boolean(col.frozen),
        `${col.key} freeze disagrees with the mounted column model`,
      );
    }
  });

  it('does not freeze a key the mounted model no longer carries', () => {
    // `order` was the flat spreadsheet's trailing frozen edge. Answering true
    // for a key that is not on the grid is how the sticky offset collapsed.
    assert.equal(isReceivingGridFrozen('order'), false);
    assert.equal(isReceivingGridFrozen('title'), false);
  });
});
