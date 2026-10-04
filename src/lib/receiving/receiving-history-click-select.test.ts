/**
 * Shared row/column highlight palette (Rose).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GRID_HIGHLIGHT_PRESETS,
  LEGACY_GRID_COLUMN_HIGHLIGHT_HEX,
  normalizeGridColumnHighlight,
} from '@/design-system/components/grid/grid-column-display';

describe('GRID_HIGHLIGHT_PRESETS row/column parallel', () => {
  it('includes Rose among shared row/column highlight presets', () => {
    const rose = GRID_HIGHLIGHT_PRESETS.find((p) => p.label === 'Rose');
    assert.ok(rose);
    assert.equal(rose!.hex, LEGACY_GRID_COLUMN_HIGHLIGHT_HEX.rose);
    assert.equal(normalizeGridColumnHighlight('rose'), LEGACY_GRID_COLUMN_HIGHLIGHT_HEX.rose);
  });
});
