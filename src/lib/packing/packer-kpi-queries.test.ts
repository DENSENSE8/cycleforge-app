import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TIER_MINUTES } from './pack-tier-classifier';

test('the pack standard is the owner-declared 5 / 15 / 60 minutes', () => {
  // Not an incidental default: this is the earned-minutes basis for every
  // packer KPI, and the number printed in each report's `standards[]` block.
  assert.deepEqual(DEFAULT_TIER_MINUTES, { SMALL: 5, MEDIUM: 15, LARGE: 60 });
});

test('packerKpiSummaryToCsvRows formats per-packer table', async () => {
  const { packerKpiSummaryToCsvRows, packerKpiSummaryToCsv } = await import('./packer-kpi-queries');
  const rows = packerKpiSummaryToCsvRows({
    day: '2026-07-08',
    capacity: {
      packer_headcount: 2,
      workday_minutes: 480,
      daily_capacity_minutes: 960,
      daily_medium_target: 60,
      daily_large_target: 16,
    },
    totals: {
      small_count: 2,
      medium_count: 18,
      large_count: 4,
      total_boxes_packed: 24,
      weighted_minutes: 312,
      remaining_minutes: 648,
    },
    by_packer: [
      {
        staff_id: 4,
        staff_name: 'Alice',
        small_count: 2,
        medium_count: 18,
        large_count: 4,
        weighted_minutes: 312,
      },
    ],
    fba: {
      pending_units: 0,
      pending_weighted_minutes: 0,
      avg_minutes_per_unit: null,
      fillable_units: 0,
    },
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].packer, 'Alice');
  assert.equal(rows[0].boxes, 24);
  assert.equal(rows[0].small, 2);
  assert.equal(rows[0].medium, 18);
  assert.equal(rows[0].large, 4);
  assert.equal(rows[0].weightedMin, 312);
  assert.equal(rows[0].percentOfDay, '65.0%');

  const csv = packerKpiSummaryToCsv({
    day: '2026-07-08',
    capacity: {
      packer_headcount: 2,
      workday_minutes: 480,
      daily_capacity_minutes: 960,
      daily_medium_target: 60,
      daily_large_target: 16,
    },
    totals: {
      small_count: 2,
      medium_count: 18,
      large_count: 4,
      total_boxes_packed: 24,
      weighted_minutes: 312,
      remaining_minutes: 648,
    },
    by_packer: [
      {
        staff_id: 4,
        staff_name: 'Alice',
        small_count: 2,
        medium_count: 18,
        large_count: 4,
        weighted_minutes: 312,
      },
    ],
    fba: {
      pending_units: 0,
      pending_weighted_minutes: 0,
      avg_minutes_per_unit: null,
      fillable_units: 0,
    },
  });

  assert.match(csv, /Weighted min/);
  assert.match(csv, /Small \/ Medium \/ Large/);
  assert.match(csv, /% of day/);
});

