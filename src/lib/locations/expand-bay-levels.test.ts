/**
 * Tripwire — bay → per-level qty bins (A1–A4 / B1–B48).
 *
 * Run: node --import tsx --test src/lib/locations/expand-bay-levels.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PARTS_DRAWER_BAY_LEVELS,
  bayHandName,
  expandBayLevelCodes,
  expandBayLevelSegments,
} from './expand-bay-levels';

describe('expandBayLevelSegments', () => {
  it('expands A1–A4 and B1–B48 on zone C aisle 3 as 52 qty bins', () => {
    const rows = expandBayLevelSegments({
      zone: 'C',
      aisle: 3,
      bays: PARTS_DRAWER_BAY_LEVELS,
    });
    assert.equal(rows.length, 52);
    assert.equal(rows[0]?.hand, 'A1');
    assert.deepEqual(rows[0]?.segments, {
      zone: 'C',
      aisle: 3,
      bay: 1,
      level: 1,
      position: 1,
    });
    assert.equal(rows[3]?.hand, 'A4');
    assert.equal(rows[4]?.hand, 'B1');
    assert.equal(rows[51]?.hand, 'B48');
    assert.equal(rows[51]?.segments.bay, 2);
    assert.equal(rows[51]?.segments.level, 48);
  });

  it('emits dashed codes with the exact level in the fourth segment', () => {
    const codes = expandBayLevelCodes({
      zone: 'C',
      aisle: 3,
      bays: PARTS_DRAWER_BAY_LEVELS,
    });
    assert.equal(codes[0], 'C-03-01-1-01');
    assert.equal(codes[3], 'C-03-01-4-01');
    assert.equal(codes[4], 'C-03-02-1-01');
    assert.equal(codes[51], 'C-03-02-48-01');
  });

  it('prints one bay’s levels when given a single range', () => {
    const codes = expandBayLevelCodes({
      zone: 'C',
      aisle: 1,
      bays: [{ bay: 1, letter: 'A', levelStart: 1, levelEnd: 4 }],
    });
    assert.deepEqual(codes, [
      'C-01-01-1-01',
      'C-01-01-2-01',
      'C-01-01-3-01',
      'C-01-01-4-01',
    ]);
  });

  it('returns nothing for a missing zone letter', () => {
    assert.deepEqual(
      expandBayLevelSegments({
        zone: '',
        aisle: 3,
        bays: PARTS_DRAWER_BAY_LEVELS,
      }),
      [],
    );
  });
});

describe('bayHandName', () => {
  it('joins the bay letter to the unpadded level', () => {
    assert.equal(bayHandName('b', 48), 'B48');
    assert.equal(bayHandName('A', 1), 'A1');
  });
});
