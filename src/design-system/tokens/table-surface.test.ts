import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ELEVATION_CLASS } from './shadows';
import {
  TABLE_FROZEN_HEADER_CLASS,
  TABLE_SURFACE_CLASS,
  TABLE_SURFACE_CLIP_CLASS,
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

  it('uses a quiet sunken frozen header so airtable column rules stay visible', () => {
    assert.equal(TABLE_FROZEN_HEADER_CLASS, 'bg-surface-sunken');
  });

  it('clips every ops table with overflow-hidden (one recipe)', () => {
    assert.match(TABLE_SURFACE_CLIP_CLASS, /\boverflow-hidden\b/);
    assert.doesNotMatch(TABLE_SURFACE_CLIP_CLASS, /clip-path/);
  });
});
