import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveOutboundMetrics, OUTBOUND_METRICS, ZERO_OUTBOUND_METRICS, type OutboundMetricCtx } from './outbound-metrics';
import type { OperationsRoiData } from '@/features/operations/workspace/useOperationsRoi';

const roi = (over: Partial<OperationsRoiData> = {}): OperationsRoiData => ({
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
  generatedAt: '',
  ...over,
});

const baseCtx = (over: Partial<OutboundMetricCtx> = {}): OutboundMetricCtx => ({
  mode: 'shipped',
  total: 100,
  shipped: { ...ZERO_OUTBOUND_METRICS },
  unshipped: { total: 0, pending: 0, tested: 0, blocked: 0 },
  roi: null,
  ...over,
});

test('drops every metric with no data — no zeros, no tiles', () => {
  assert.deepEqual(resolveOutboundMetrics(baseCtx({ total: 0 })), []);
});

test('on-time ship: rate, intent thresholds, and coverage gate', () => {
  const good = resolveOutboundMetrics(baseCtx({ shipped: { ...ZERO_OUTBOUND_METRICS, onTime: 98, onTimeCoverage: 100 } }));
  const onTime = good.find((m) => m.id === 'ontime');
  assert.equal(onTime?.value, '98%');
  assert.equal(onTime?.intent, 'good');

  const bad = resolveOutboundMetrics(baseCtx({ shipped: { ...ZERO_OUTBOUND_METRICS, onTime: 70, onTimeCoverage: 100 } }));
  assert.equal(bad.find((m) => m.id === 'ontime')?.intent, 'bad');

  // No deadline coverage → the tile must not appear (would divide by zero).
  const none = resolveOutboundMetrics(baseCtx({ shipped: { ...ZERO_OUTBOUND_METRICS, onTime: 0, onTimeCoverage: 0 } }));
  assert.equal(none.find((m) => m.id === 'ontime'), undefined);
});

test('packed tile: neutral value color, trend lives only in the delta', () => {
  // A volume count is not a health state — the value stays calm/neutral and the
  // DeltaChip alone carries the up/down sign (so a down week never renders red).
  const down = resolveOutboundMetrics(baseCtx({ roi: roi({ pctChange: -13 }) }));
  const packed = down.find((m) => m.id === 'packed');
  assert.equal(packed?.value, '112');
  assert.equal(packed?.delta, -13);
  assert.equal(packed?.intent, 'neutral');
  assert.equal(resolveOutboundMetrics(baseCtx({ roi: roi({ pctChange: 5 }) })).find((m) => m.id === 'packed')?.intent, 'neutral');
});

test('level metrics carry a board filter; rate/trend metrics do not', () => {
  const ctx = baseCtx({
    total: 100,
    shipped: { ...ZERO_OUTBOUND_METRICS, delivered: 20, exceptions: 15, onTime: 70, onTimeCoverage: 100 },
    roi: roi(),
  });
  const byId = Object.fromEntries(resolveOutboundMetrics(ctx, 6).map((m) => [m.id, m]));
  assert.equal(byId.delivered?.filterState, 'DELIVERED');
  assert.equal(byId.exceptions?.filterState, 'EXCEPTION');
  // packed / on-time have no honest ?ostatus state → tooltip-only, no filter.
  assert.equal(byId.packed?.filterState, undefined);
  assert.equal(byId.ontime?.filterState, undefined);
  // every rendered tile ships a hover definition.
  for (const m of Object.values(byId)) assert.ok(m.tooltip, `${m.id} needs a tooltip`);
});

test('mode filters the registry + caps at the limit', () => {
  const shipped = resolveOutboundMetrics(
    baseCtx({ shipped: { ...ZERO_OUTBOUND_METRICS, delivered: 20, inTransit: 5, exceptions: 15 }, roi: roi() }),
    4,
  );
  assert.ok(shipped.length <= 4);
  // Unshipped-only ids never leak into shipped mode.
  assert.equal(shipped.find((m) => m.id === 'ready'), undefined);

  const unshipped = resolveOutboundMetrics(
    baseCtx({ mode: 'unshipped', unshipped: { total: 33, pending: 12, tested: 21, blocked: 3 }, roi: roi() }),
  );
  assert.ok(unshipped.some((m) => m.id === 'ready'));
  assert.equal(unshipped.find((m) => m.id === 'ontime'), undefined);
});

test('every registry entry returns null on empty context (zero-safe)', () => {
  for (const def of OUTBOUND_METRICS) {
    for (const mode of def.modes) {
      assert.equal(def.compute(baseCtx({ mode, total: 0 })), null, `${def.id} must be null when empty`);
    }
  }
});
