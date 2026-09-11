/**
 * Tripwire — bay segment face is Bay on internal + printed labels.
 *
 * Run: node --import tsx --test src/lib/format-location-bay-face.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LOCATION_BAY_LABEL,
  LOCATION_BAY_LABEL_PLURAL,
  bayHand,
  formatLocationBayFace,
} from './barcode-routing';

describe('formatLocationBayFace', () => {
  it('uses Bay, not Rack, and keeps Left/Right from bayHand', () => {
    assert.equal(LOCATION_BAY_LABEL, 'Bay');
    assert.equal(LOCATION_BAY_LABEL_PLURAL, 'Bays');
    assert.equal(formatLocationBayFace(1), 'Bay 01 (Left)');
    assert.equal(formatLocationBayFace(2), 'Bay 02 (Right)');
    assert.equal(bayHand(1), 'Left');
    assert.equal(bayHand(2), 'Right');
  });
});
