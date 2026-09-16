import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PACK_STOP_INDEX,
  PACK_STANDARD_MINUTE_STOPS,
  formatPackMinutes,
  minutesForStopIndex,
  snapMinutes,
  stopIndexForMinutes,
  tierForMinutes,
} from './pack-standard-stops';
import { DEFAULT_TIER_MINUTES } from './pack-tier-classifier';

test('stops are ascending and unique — the slider index must be monotonic', () => {
  for (let i = 1; i < PACK_STANDARD_MINUTE_STOPS.length; i += 1) {
    assert.ok(
      PACK_STANDARD_MINUTE_STOPS[i] > PACK_STANDARD_MINUTE_STOPS[i - 1],
      `stop ${i} is not greater than its predecessor`,
    );
  }
});

test('a tier default survives a round trip through the slider', () => {
  // The boundaries are midpoints between these three, so snapping a default
  // must not move it across a tier — otherwise editing minutes silently
  // reclassifies every rules-tiered SKU.
  for (const [tier, minutes] of Object.entries(DEFAULT_TIER_MINUTES)) {
    assert.equal(tierForMinutes(snapMinutes(minutes)), tier, `${tier} (${minutes}m) changed tier`);
  }
});

test('tierForMinutes splits on the documented boundaries', () => {
  assert.equal(tierForMinutes(1), 'SMALL');
  assert.equal(tierForMinutes(8), 'SMALL');
  assert.equal(tierForMinutes(10), 'MEDIUM');
  assert.equal(tierForMinutes(25), 'MEDIUM');
  assert.equal(tierForMinutes(30), 'LARGE');
  assert.equal(tierForMinutes(60), 'LARGE');
});

test('stopIndexForMinutes picks the nearest stop, ties going to the smaller', () => {
  assert.equal(minutesForStopIndex(stopIndexForMinutes(14)), 15);
  assert.equal(minutesForStopIndex(stopIndexForMinutes(4)), 3);
  assert.equal(minutesForStopIndex(stopIndexForMinutes(45)), 45);
  assert.equal(minutesForStopIndex(stopIndexForMinutes(999)), 60);
  assert.equal(minutesForStopIndex(stopIndexForMinutes(0)), 1);
});

test('a missing standard falls back to the first stop rather than NaN', () => {
  assert.equal(snapMinutes(null), 1);
  assert.equal(snapMinutes(undefined), 1);
  assert.equal(snapMinutes(Number.NaN), 1);
});

test('minutesForStopIndex clamps an out-of-range slider value', () => {
  assert.equal(minutesForStopIndex(-5), 1);
  assert.equal(minutesForStopIndex(MAX_PACK_STOP_INDEX + 7), 60);
});

test('formatPackMinutes reads as an operator would say it', () => {
  assert.equal(formatPackMinutes(8), '8 min');
  assert.equal(formatPackMinutes(45), '45 min');
  assert.equal(formatPackMinutes(60), '1 hr');
  assert.equal(formatPackMinutes(90), '1 hr 30 min');
});
