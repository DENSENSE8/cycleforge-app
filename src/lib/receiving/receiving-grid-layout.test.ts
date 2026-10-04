/** Receiving sort vocabulary — the one sortability answer every receiving card face (`?colsort=`) reads. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isReceivingGridSortable, receivingSortFactFor } from '@/lib/receiving/receiving-grid-layout';

describe('isReceivingGridSortable — the one sortability answer', () => {
  it('keeps the fact words sortable and the chrome tracks not', () => {
    assert.equal(isReceivingGridSortable('title'), true);
    assert.equal(isReceivingGridSortable('date'), true);
    assert.equal(isReceivingGridSortable('select'), false);
    assert.equal(isReceivingGridSortable('_fill'), false);
  });

  it('reads a legacy two-row track name in a saved link as its fact word', () => {
    assert.equal(receivingSortFactFor('dates'), 'date');
    assert.equal(receivingSortFactFor('fulfillment'), 'order');
    assert.equal(receivingSortFactFor('item'), 'title');
    assert.equal(receivingSortFactFor('state'), 'status');
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
