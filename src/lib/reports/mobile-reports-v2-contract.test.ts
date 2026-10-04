import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { OperationsReportPayload } from './operations-report-contract';
import {
  MOBILE_REPORTS_V2_DEFINITION_OF_DONE,
  MOBILE_REPORTS_V2_FACETS,
} from './mobile-reports-v2-contract';
import { buildMobileReportsV2Model } from './mobile-reports-v2-model';

test('reports V2 pins its top-level facets and the deleted V1 forks', () => {
  assert.deepEqual(MOBILE_REPORTS_V2_FACETS, [
    { id: 'pulse', label: 'Pulse' },
    { id: 'stages', label: 'Stages' },
    { id: 'staff', label: 'Staff' },
  ]);
  assert.ok(MOBILE_REPORTS_V2_DEFINITION_OF_DONE.deleted.includes('single long report page'));
  assert.ok(MOBILE_REPORTS_V2_DEFINITION_OF_DONE.deleted.includes('condensed industrial interface role'));
  assert.ok(MOBILE_REPORTS_V2_DEFINITION_OF_DONE.deleted.includes('boxed KPI metric grid'));

  const source = readFileSync(
    new URL('../../components/mobile/reports/MobilePackerReport.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /tabs=\{\[\.\.\.MOBILE_REPORTS_V2_FACETS\]\}/);
  assert.match(source, /view === 'pulse'/);
  assert.match(source, /view === 'stages'/);
  assert.match(source, /view === 'staff'/);
  assert.doesNotMatch(source, /reports-history/);
  assert.match(source, /<DetailDock/);
  assert.match(source, /ariaLabel="Refresh operations report"/);
});

test('reports V2 separates observed stage time from standard capacity and keeps the full roster', () => {
  const payload = fixture();
  const model = buildMobileReportsV2Model(payload, {
    live: true,
    now: new Date('2026-10-01T19:00:00.000Z').getTime(),
  });

  assert.equal(model.status.label, 'Behind');
  assert.equal(model.standardMinutes, 500);
  assert.equal(model.capacityMinutes, 480);
  assert.deepEqual(model.stages.map((stage) => ({
    id: stage.id,
    median: stage.medianSeconds,
    p90: stage.p90Seconds,
    coverage: stage.coveragePercent,
  })), [
    { id: 'pick', median: 60, p90: 120, coverage: 100 },
    { id: 'pack', median: 90, p90: 90, coverage: 50 },
  ]);
  assert.equal(model.staff.working[0]?.staffName, 'Ari');
  assert.equal(model.staff.idle[0]?.staffName, 'Bo');
  assert.deepEqual(model.attention.map((item) => item.id), ['capacity', 'stale-work', 'pack-coverage']);
});

function fixture(): OperationsReportPayload {
  return {
    ok: true,
    day: '2026-10-01',
    generatedAt: '2026-10-01T19:00:00.000Z',
    packingSummary: {
      day: '2026-10-01',
      capacity: {
        packer_headcount: 1,
        workday_minutes: 480,
        daily_capacity_minutes: 480,
        daily_medium_target: 60,
        daily_large_target: 16,
      },
      totals: {
        small_count: 1,
        medium_count: 1,
        large_count: 0,
        total_boxes_packed: 2,
        weighted_minutes: 500,
        remaining_minutes: 0,
      },
      by_packer: [],
      fba: {
        pending_units: 20,
        pending_weighted_minutes: 600,
        avg_minutes_per_unit: 30,
        fillable_units: 0,
      },
    },
    packingRows: [],
    summary: {
      pickCount: 2,
      packCount: 2,
      medianPickSeconds: 90,
      medianPackSeconds: 90,
      activePickCount: 1,
      activePackCount: 0,
    },
    staff: [
      {
        staffId: 1,
        staffName: 'Ari',
        pickCount: 2,
        packCount: 2,
        medianPickSeconds: 90,
        medianPackSeconds: 90,
        activeOperations: [{
          key: 'pick:active',
          kind: 'pick',
          staffId: 1,
          staffName: 'Ari',
          title: 'Order 12',
          startedAt: '2026-10-01T17:00:00.000Z',
          href: '/m/orders/12/activity',
        }],
      },
      {
        staffId: 2,
        staffName: 'Bo',
        pickCount: 0,
        packCount: 0,
        medianPickSeconds: null,
        medianPackSeconds: null,
        activeOperations: [],
      },
    ],
    activity: [
      operation('pick:1', 'pick', 60),
      operation('pick:2', 'pick', 120),
      operation('pack:1', 'pack', 90),
      operation('pack:2', 'pack', null),
    ],
    activeOperations: [{
      key: 'pick:active',
      kind: 'pick',
      staffId: 1,
      staffName: 'Ari',
      title: 'Order 12',
      startedAt: '2026-10-01T17:00:00.000Z',
      href: '/m/orders/12/activity',
    }],
  };
}

function operation(key: string, kind: 'pick' | 'pack', durationSeconds: number | null) {
  return {
    key,
    kind,
    staffId: 1,
    staffName: 'Ari',
    title: key,
    subtitle: null,
    startedAt: null,
    completedAt: '2026-10-01T18:00:00.000Z',
    durationSeconds,
    href: null,
  };
}
