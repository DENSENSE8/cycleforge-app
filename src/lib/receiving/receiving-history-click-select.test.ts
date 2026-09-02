/** Unbox History click-select + shared row/column highlight palette (Rose). */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RECEIVING_COMPOUND_COLUMNS } from '@/lib/receiving/receiving-grid-layout';
import {
  GRID_HIGHLIGHT_PRESETS,
  LEGACY_GRID_COLUMN_HIGHLIGHT_HEX,
  normalizeGridColumnHighlight,
} from '@/design-system/components/grid/grid-column-display';

describe('Unbox History compound click-select column model', () => {
  it('keeps the shared select and thumbnail identity pane frozen', () => {
    const select = RECEIVING_COMPOUND_COLUMNS.find((column) => column.key === 'select');
    const thumb = RECEIVING_COMPOUND_COLUMNS.find((column) => column.key === 'thumb');
    assert.ok(select);
    assert.ok(thumb);
    assert.equal(select.frozen, true);
    assert.equal(select.sortable, false);
    assert.equal(thumb.frozen, true);
  });
});

describe('GRID_HIGHLIGHT_PRESETS row/column parallel', () => {
  it('includes Rose among shared row/column highlight presets', () => {
    const rose = GRID_HIGHLIGHT_PRESETS.find((preset) => preset.label === 'Rose');
    assert.ok(rose);
    assert.equal(rose.hex, LEGACY_GRID_COLUMN_HIGHLIGHT_HEX.rose);
    assert.equal(normalizeGridColumnHighlight('rose'), LEGACY_GRID_COLUMN_HIGHLIGHT_HEX.rose);
  });
});