import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GRID_IDENTITY_COLUMN_KEYS,
  isGridColumnInCellEditable,
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
});
