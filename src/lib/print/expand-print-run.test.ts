/**
 * Tripwire — ragged bay/level expand for mobile bulk print.
 *
 * Run: node --import tsx --test src/lib/print/expand-print-run.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  baysMatchingParity,
  expandRaggedBayLevelsPrintRun,
} from './expand-print-run';

describe('expandRaggedBayLevelsPrintRun', () => {
  it('expands rack labels at position 0 with per-bay heights', () => {
    const segs = expandRaggedBayLevelsPrintRun({
      zone: 'c',
      aisle: 2,
      selectedBays: [1, 3],
      bayLevels: { 1: 2, 3: 1 },
      grain: 'rack',
    });
    assert.deepEqual(segs, [
      { zone: 'C', aisle: 2, bay: 1, level: 1, position: 0 },
      { zone: 'C', aisle: 2, bay: 1, level: 2, position: 0 },
      { zone: 'C', aisle: 2, bay: 3, level: 1, position: 0 },
    ]);
  });

  it('expands bin labels at position 1', () => {
    const segs = expandRaggedBayLevelsPrintRun({
      zone: 'A',
      aisle: 1,
      selectedBays: [2],
      bayLevels: { 2: 1 },
      grain: 'bin',
    });
    assert.equal(segs[0]?.position, 1);
  });

  it('returns empty when zone is missing', () => {
    assert.deepEqual(
      expandRaggedBayLevelsPrintRun({
        zone: '',
        aisle: 1,
        selectedBays: [1],
        bayLevels: { 1: 1 },
        grain: 'rack',
      }),
      [],
    );
  });
});

describe('baysMatchingParity', () => {
  it('filters odds and evens', () => {
    assert.deepEqual(baysMatchingParity([1, 2, 3, 4], 'odds'), [1, 3]);
    assert.deepEqual(baysMatchingParity([1, 2, 3, 4], 'evens'), [2, 4]);
  });
});
