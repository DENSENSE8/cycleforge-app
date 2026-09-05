import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RECEIVING_COMPOUND_COLUMNS,
  RECEIVING_GRID_FROZEN_EDGE_KEY,
  isReceivingGridFrozen,
  isReceivingGridSortable,
  receivingGridTemplate,
} from '@/lib/receiving/receiving-grid-layout';

describe('Receiving compound column model', () => {
  it('uses the canonical shared tracks in order', () => {
    assert.deepEqual(
      RECEIVING_COMPOUND_COLUMNS.map((column) => column.key),
      ['select', 'fulfillment', 'thumb', 'item', 'dates', 'state', '_fill'],
    );
  });

  it('freezes the shared identity gutters and shadows at thumb', () => {
    assert.equal(isReceivingGridFrozen('select'), true);
    assert.equal(isReceivingGridFrozen('fulfillment'), true);
    assert.equal(isReceivingGridFrozen('thumb'), true);
    assert.equal(RECEIVING_GRID_FROZEN_EDGE_KEY, 'thumb');
  });

  it('keeps the item track resizable and slack in the trailing fill track', () => {
    const item = RECEIVING_COMPOUND_COLUMNS.find((column) => column.key === 'item')!;
    const fill = RECEIVING_COMPOUND_COLUMNS.find((column) => column.key === '_fill')!;
    assert.equal(item.resizable, true);
    assert.equal(fill.resizable, false);
    assert.equal((receivingGridTemplate().match(/1fr/g) ?? []).length, 1);
  });

  it('uses one sortability answer for compound and custom keys', () => {
    assert.equal(isReceivingGridSortable('item'), true);
    assert.equal(isReceivingGridSortable('fulfillment'), true);
    assert.equal(isReceivingGridSortable('state'), true);
    assert.equal(isReceivingGridSortable('thumb'), false);
    assert.equal(isReceivingGridSortable('select'), false);
    assert.equal(isReceivingGridSortable('_fill'), false);
    assert.equal(isReceivingGridSortable('custom:rack_slot'), true);
    assert.equal(isReceivingGridSortable('custom:'), false);
  });
});