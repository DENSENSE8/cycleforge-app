/**
 * Shipping KPI registry — filterUstatus + ROI tiles for Pending.
 * Run: npx tsx --test src/lib/tech/shipping-metrics.test.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OperationsRoiData } from '@/features/operations/workspace/useOperationsRoi';
import {
  resolveShippingMetrics,
  splitShippingAttention,
  ZERO_SHIPPING_FBA,
  ZERO_SHIPPING_HISTORY,
} from './shipping-metrics';

function roi(over: Partial<OperationsRoiData> = {}): OperationsRoiData {
  return {
    hasData: true,
    unitsThisWeek: 112,
    unitsLastWeek: 129,
    pctChange: -13,
    unitsPerLaborHour: 0,
    unitsProcessed: 0,
    laborHours: 0,
    perStaff: [],
    avgCycleHoursByStage: [],
    unitsStuck: 16,
    generatedAt: new Date().toISOString(),
    ...over,
  };
}

test('pending lane metrics carry filterUstatus for click-to-filter', () => {
  const metrics = resolveShippingMetrics({
    mode: 'pending',
    unshipped: { total: 70, pending: 53, picked: 16, blocked: 1 },
    fba: ZERO_SHIPPING_FBA,
    history: ZERO_SHIPPING_HISTORY,
    roi: null,
  });
  const byId = Object.fromEntries(metrics.map((m) => [m.id, m]));
  assert.equal(byId.ready?.filterUstatus, 'PICKED');
  assert.equal(byId.awaiting?.filterUstatus, 'PENDING');
  assert.equal(byId.blocked?.filterUstatus, 'BLOCKED');
  assert.equal(byId.blocked?.severity, 3);
  assert.equal(byId.packed, undefined);
  assert.equal(byId.stuck, undefined);
});

test('pending ROI tiles: packed trend + stuck attention', () => {
  const metrics = resolveShippingMetrics({
    mode: 'pending',
    unshipped: { total: 70, pending: 53, picked: 16, blocked: 1 },
    fba: ZERO_SHIPPING_FBA,
    history: ZERO_SHIPPING_HISTORY,
    roi: roi(),
  });
  const byId = Object.fromEntries(metrics.map((m) => [m.id, m]));
  assert.equal(byId.packed?.value, '112');
  assert.equal(byId.packed?.delta, -13);
  assert.equal(byId.packed?.severity, 0);
  assert.equal(byId.stuck?.value, '16');
  assert.equal(byId.stuck?.severity, 2);
  assert.equal(byId.stuck?.filterUstatus, undefined);

  const { attention, rest } = splitShippingAttention(metrics);
  assert.ok(attention.some((m) => m.id === 'stuck'));
  assert.ok(attention.some((m) => m.id === 'blocked'));
  assert.deepEqual(
    rest.filter((m) => m.id === 'packed').map((m) => m.id),
    ['packed'],
  );
});

test('pending metrics drop when counts are zero', () => {
  const metrics = resolveShippingMetrics({
    mode: 'pending',
    unshipped: { total: 0, pending: 0, picked: 0, blocked: 0 },
    fba: ZERO_SHIPPING_FBA,
    history: ZERO_SHIPPING_HISTORY,
    roi: null,
  });
  assert.equal(metrics.length, 0);
});
