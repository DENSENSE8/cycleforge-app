import test from 'node:test';
import assert from 'node:assert/strict';
import {
  packingBoxesByTierSegments,
  packingBoxesDistributionRows,
  packingCapacitySegments,
  packingMinutesByTierSegments,
  tierMinutesFromCounts,
} from './packing-kpi-chart-segments';

test('tierMinutesFromCounts uses DEFAULT_TIER_MINUTES weights', () => {
  const m = tierMinutesFromCounts({ small_count: 2, medium_count: 1, large_count: 1 });
  assert.equal(m.small, 10);
  assert.equal(m.medium, 14);
  assert.equal(m.large, 45);
  assert.equal(m.total, 69);
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
  assert.equal(segs[0].value, 10);
  assert.equal(segs[1].value, 252);
  assert.equal(segs[2].value, 180);
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
