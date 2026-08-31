/**
 * Unit coverage for the shared highlight normalize helpers (row fills).
 *
 * Run: `npx tsx --test src/design-system/components/grid/grid-column-display.test.ts`
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LEGACY_GRID_COLUMN_HIGHLIGHT_HEX,
  isPersistedGridColumnHighlight,
  normalizeGridColumnHighlight,
} from './grid-column-display';

describe('normalizeGridColumnHighlight', () => {
  it('treats absent / none as no wash', () => {
    assert.equal(normalizeGridColumnHighlight(undefined), null);
    assert.equal(normalizeGridColumnHighlight(null), null);
    assert.equal(normalizeGridColumnHighlight('none'), null);
    assert.equal(normalizeGridColumnHighlight(''), null);
  });

  it('maps legacy named washes to their *-50 hex', () => {
    assert.equal(normalizeGridColumnHighlight('blue'), LEGACY_GRID_COLUMN_HIGHLIGHT_HEX.blue);
    assert.equal(normalizeGridColumnHighlight('amber'), LEGACY_GRID_COLUMN_HIGHLIGHT_HEX.amber);
    assert.equal(normalizeGridColumnHighlight('rose'), LEGACY_GRID_COLUMN_HIGHLIGHT_HEX.rose);
    assert.equal(normalizeGridColumnHighlight('emerald'), LEGACY_GRID_COLUMN_HIGHLIGHT_HEX.emerald);
  });

  it('lowercases valid free hex', () => {
    assert.equal(normalizeGridColumnHighlight('#EFF6FF'), '#eff6ff');
    assert.equal(normalizeGridColumnHighlight('#a1b2c3'), '#a1b2c3');
  });

  it('rejects garbage', () => {
    assert.equal(normalizeGridColumnHighlight('blueish'), null);
    assert.equal(normalizeGridColumnHighlight('#fff'), null);
    assert.equal(normalizeGridColumnHighlight('rgb(0,0,0)'), null);
  });
});

describe('isPersistedGridColumnHighlight', () => {
  it('persists only real washes', () => {
    assert.equal(isPersistedGridColumnHighlight('blue'), true);
    assert.equal(isPersistedGridColumnHighlight('#eff6ff'), true);
    assert.equal(isPersistedGridColumnHighlight('none'), false);
    assert.equal(isPersistedGridColumnHighlight(null), false);
  });
});
