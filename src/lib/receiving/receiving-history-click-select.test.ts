/**
 * Unbox History click-select + shared row/column highlight palette (Rose).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RECEIVING_GRID_COLUMNS } from '@/lib/receiving/receiving-grid-layout';
import {
  GRID_HIGHLIGHT_PRESETS,
  LEGACY_GRID_COLUMN_HIGHLIGHT_HEX,
  normalizeGridColumnHighlight,
} from '@/lib/grid/grid-column-display';

describe('Unbox History click-select column model', () => {
  it('keeps frozen select · order identity pane for header select-all + PO', () => {
    const select = RECEIVING_GRID_COLUMNS.find((c) => c.key === 'select');
    const order = RECEIVING_GRID_COLUMNS.find((c) => c.key === 'order');
    assert.ok(select);
    assert.ok(order);
    assert.equal(select!.frozen, true);
    assert.equal(select!.sortable, false);
    assert.equal(order!.frozen, true);
    assert.equal(order!.hideKey, undefined);
  });
});

describe('GRID_HIGHLIGHT_PRESETS row/column parallel', () => {
  it('includes Rose among shared row/column highlight presets', () => {
    const rose = GRID_HIGHLIGHT_PRESETS.find((p) => p.label === 'Rose');
    assert.ok(rose);
    assert.equal(rose!.hex, LEGACY_GRID_COLUMN_HIGHLIGHT_HEX.rose);
    assert.equal(normalizeGridColumnHighlight('rose'), LEGACY_GRID_COLUMN_HIGHLIGHT_HEX.rose);
  });
});
