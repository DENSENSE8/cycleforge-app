/**
 * Unbox History click-select + shared row/column highlight palette (Rose).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RECEIVING_COMPOUND_COLUMNS } from '@/lib/receiving/receiving-grid-layout';
import {
  GRID_HIGHLIGHT_PRESETS,
  LEGACY_GRID_COLUMN_HIGHLIGHT_HEX,
  normalizeGridColumnHighlight,
} from '@/design-system/components/grid/grid-column-display';

describe('Unbox History click-select column model', () => {
  it('keeps a frozen select gutter for header select-all', () => {
    const select = RECEIVING_COMPOUND_COLUMNS.find((c) => c.key === 'select');
    assert.ok(select);
    assert.equal(select!.frozen, true);
    assert.equal(select!.sortable, false);
  });

  it('pins the identity track beside it, always-on', () => {
    // The PO identity rides the compound `fulfillment` track since the flat
    // spreadsheet model was deleted. It must stay frozen (sticky identity) and
    // carry no hideKey — an operator cannot hide the row's own name.
    const identity = RECEIVING_COMPOUND_COLUMNS.find((c) => c.key === 'fulfillment');
    assert.ok(identity);
    assert.equal(identity!.frozen, true);
    assert.equal(identity!.hideKey, undefined);
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
