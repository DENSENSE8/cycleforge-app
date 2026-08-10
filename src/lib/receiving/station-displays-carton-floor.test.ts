/**
 * Unit tests for Station Displays carton Macro floor actions.
 *
 * Run: `node --test --import tsx src/lib/receiving/station-displays-carton-floor.test.ts`
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  stationDisplaysFloorMoreItems,
  stationDisplaysFloorPrimaryAction,
} from './station-displays-carton-floor';

describe('stationDisplaysFloorPrimaryAction', () => {
  test('matched carton → Print', () => {
    const primary = stationDisplaysFloorPrimaryAction({ unfound: false });
    assert.equal(primary.key, 'print');
    assert.equal(primary.label, 'Print');
  });

  test('unfound → Resolve (not Open Unbox)', () => {
    const primary = stationDisplaysFloorPrimaryAction({ unfound: true });
    assert.equal(primary.key, 'link');
    assert.equal(primary.label, 'Resolve');
  });
});

describe('stationDisplaysFloorMoreItems', () => {
  test('matched → empty overflow', () => {
    assert.deepEqual(stationDisplaysFloorMoreItems({ unfound: false }), []);
  });

  test('unfound → Resolve in overflow', () => {
    assert.deepEqual(stationDisplaysFloorMoreItems({ unfound: true }), [
      { key: 'link', label: 'Resolve' },
    ]);
  });
});
