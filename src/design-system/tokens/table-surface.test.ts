import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ELEVATION_CLASS } from './shadows';
import {
  TABLE_FROZEN_HEADER_CLASS,
  TABLE_SURFACE_CLASS,
  TABLE_SURFACE_CLIP_CLASS,
  TABLE_SURFACE_SHEET_CLASS,
} from './table-surface';

describe('table-surface SoT', () => {
  it('frames ops tables with xl radius, border, and raised (default) lift', () => {
    assert.match(TABLE_SURFACE_CLASS, /\brounded-xl\b/);
    assert.match(TABLE_SURFACE_CLASS, /\bborder\b/);
    assert.match(TABLE_SURFACE_CLASS, /\bborder-border-soft\b/);
    assert.match(TABLE_SURFACE_CLASS, /\bbg-surface-card\b/);
    assert.ok(
      TABLE_SURFACE_CLASS.includes(ELEVATION_CLASS.raised.default),
      'ops tables use elevationClass(raised) for work-card depth',
    );
  });

  it('uses a card-white frozen header; borders carry hierarchy', () => {
    assert.equal(TABLE_FROZEN_HEADER_CLASS, 'bg-surface-card');
  });

  it('clips framed ops tables with overflow-hidden', () => {
    assert.match(TABLE_SURFACE_CLIP_CLASS, /\boverflow-hidden\b/);
    assert.doesNotMatch(TABLE_SURFACE_CLIP_CLASS, /clip-path/);
  });

  it('Sheets plane: hairline only — no radius, no raised lift, no side edges', () => {
    assert.doesNotMatch(TABLE_SURFACE_SHEET_CLASS, /\brounded-xl\b/);
    assert.doesNotMatch(TABLE_SURFACE_SHEET_CLASS, /\bshadow-elev/);
    assert.ok(
      !TABLE_SURFACE_SHEET_CLASS.includes(ELEVATION_CLASS.raised.default),
      'sheet plane must not carry raised elevation',
    );
    // Side rails own the vertical seams — sheet is border-y only (not border + border-l-0).
    assert.match(TABLE_SURFACE_SHEET_CLASS, /\bborder-y\b/);
    assert.doesNotMatch(TABLE_SURFACE_SHEET_CLASS, /\bborder-l\b|\bborder-r\b|\bborder\b(?!-)/);
    assert.match(TABLE_SURFACE_SHEET_CLASS, /\bborder-border-soft\b/);
    assert.match(TABLE_SURFACE_SHEET_CLASS, /\bbg-surface-card\b/);
    assert.match(TABLE_SURFACE_SHEET_CLASS, /\boverflow-hidden\b/);
  });
});
