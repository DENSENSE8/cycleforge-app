import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GRID_IDENTITY_COLUMN_KEYS,
  isGridColumnFillTrack,
  isGridColumnPaintTrack,
  isGridColumnInCellEditable,
  isGridColumnResizable,
  isGridIdentityColumn,
} from './grid-column-editability';

describe('grid column editability SoT', () => {
  it('pins select · title as the identity pane', () => {
    assert.deepEqual([...GRID_IDENTITY_COLUMN_KEYS], ['select', 'title']);
  });

  it('treats identity keys as non-editable in the collection map', () => {
    for (const key of GRID_IDENTITY_COLUMN_KEYS) {
      assert.equal(isGridIdentityColumn(key), true);
      assert.equal(isGridColumnInCellEditable(key), false);
    }
  });

  it('allows fact columns to opt into in-cell editing', () => {
    for (const key of ['qty', 'date', 'condition', 'note', 'link', 'sku']) {
      assert.equal(isGridIdentityColumn(key), false);
      assert.equal(isGridColumnInCellEditable(key), true);
    }
  });

  it('keeps number + price fixed and unlocks id + location resize (Sheets parity)', () => {
    assert.equal(isGridColumnResizable({ key: 'qty', type: 'number' }), false);
    assert.equal(isGridColumnResizable({ key: 'price', type: 'price' }), false);
    assert.equal(isGridColumnResizable({ key: 'order', type: 'id' }), true);
    assert.equal(isGridColumnResizable({ key: 'location', type: 'location' }), true);
    assert.equal(isGridColumnResizable({ key: 'select' }), false);
  });

  it('marks `_fill` as a non-resizable structural filler', () => {
    assert.equal(isGridColumnFillTrack({ key: '_fill' }), true);
    assert.equal(isGridColumnFillTrack({ key: 'tracking' }), false);
    assert.equal(isGridColumnResizable({ key: '_fill', resizable: false }), false);
  });

  it('marks `_paint` as non-resizable header chrome', () => {
    assert.equal(isGridColumnPaintTrack({ key: '_paint' }), true);
    assert.equal(isGridColumnPaintTrack({ key: '_fill' }), false);
    assert.equal(isGridColumnResizable({ key: '_paint' }), false);
  });
});
