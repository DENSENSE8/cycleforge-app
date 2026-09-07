import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TIER_MINUTES } from '@/lib/packing/pack-tier-classifier';
import {
  packingBoxesByTierSegments,
  packingBoxesDistributionRows,
  packingCapacitySegments,
  packingMinutesByTierSegments,
  tierMinutesFromCounts,
} from './packing-kpi-chart-segments';

// The weights are DERIVED, never retyped: this test hardcoded 5/14/45 and went
// red the moment the pack standard moved to 5/15/60, which is the same defect
// the operator reports were audited for — a printed digit that cannot follow
// its constant. Change DEFAULT_TIER_MINUTES and these assertions move with it.
const { SMALL, MEDIUM, LARGE } = DEFAULT_TIER_MINUTES;

test('tierMinutesFromCounts uses DEFAULT_TIER_MINUTES weights', () => {
  const m = tierMinutesFromCounts({ small_count: 2, medium_count: 1, large_count: 1 });
  assert.equal(m.small, 2 * SMALL);
  assert.equal(m.medium, MEDIUM);
  assert.equal(m.large, LARGE);
  assert.equal(m.total, 2 * SMALL + MEDIUM + LARGE);
});

test('packingBoxesByTierSegments maps S/M/L counts', () => {
  const segs = packingBoxesByTierSegments({ small_count: 3, medium_count: 0, large_count: 2 });
  assert.equal(segs.length, 3);
  assert.equal(segs[0].value, 3);
  assert.equal(segs[1].value, 0);
  assert.equal(segs[2].value, 2);
});

test('packingMinutesByTierSegments mirrors weighted minutes', () => {
  const segs = packingMinutesByTierSegments({ small_count: 2, medium_count: 18, large_count: 4 });
  assert.equal(segs[0].value, 2 * SMALL);
  assert.equal(segs[1].value, 18 * MEDIUM);
  assert.equal(segs[2].value, 4 * LARGE);
});

test('packingCapacitySegments splits used vs remaining', () => {
  const segs = packingCapacitySegments({ weightedMinutes: 312, dailyCapacityMinutes: 960 });
  assert.equal(segs[0].key, 'used');
  assert.equal(segs[0].value, 312);
  assert.equal(segs[1].key, 'remaining');
  assert.equal(segs[1].value, 648);
});

test('packingBoxesDistributionRows omits zero tiers and computes percent', () => {
  const rows = packingBoxesDistributionRows({ small_count: 5, medium_count: 5, large_count: 0 });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].percent, 50);
  assert.equal(rows[1].percent, 50);
});
