import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveMonitorValue,
  type MonitorValueInput,
  type OutboundQueueCounts,
  type BoundedUnshippedCountSpec,
  type ResolveValueDeps,
} from './resolve-value';

/** A fixture bundle where the COARSE split and the LANE-accurate counts diverge, so the parity assertion (mapped facet == the aggregate's… */
const BUNDLE: OutboundQueueCounts = {
  total: 15,
  byStage: { pending: 9, tested: 6 },
  urgent: 7,
  combos: [
    { hasTechScan: false, blocked: false, count: 6 }, // PENDING
    { hasTechScan: true, blocked: false, count: 4 }, // TESTED
    { hasTechScan: false, blocked: true, count: 3 }, // BLOCKED (exception-first)
    { hasTechScan: true, blocked: true, count: 2 }, // BLOCKED (exception-first)
  ],
  packPlacement: {
    totalPlaced: 5,
    counts: [
      { locationId: 10, count: 3 },
      { locationId: 20, count: 2 },
    ],
  },
};

const FALLBACK = 42;

function fakeDeps(bundle: OutboundQueueCounts = BUNDLE) {
  const calls = {
    outboundQueueCounts: [] as Array<{ staffId?: number; needsPlacement?: boolean }>,
    boundedUnshippedCount: [] as BoundedUnshippedCountSpec[],
  };
  const deps: ResolveValueDeps = {
    async outboundQueueCounts(opts) {
      calls.outboundQueueCounts.push(opts);
      return bundle;
    },
    async boundedUnshippedCount(spec) {
      calls.boundedUnshippedCount.push(spec);
      return FALLBACK;
    },
  };
  return { deps, calls };
}

function input(query: string, over: Partial<MonitorValueInput> = {}): MonitorValueInput {
  return { monitorSurface: 'dashboard_unshipped', monitorParams: { query }, thresholdType: 'count_above', ...over };
}

// ── Parity: the mapped facet reuses the aggregate, no new query ──────────────

test('parity — a Pending (stage=pending) monitor returns exactly byStage.pending and issues NO fallback query', async () => {
  const { deps, calls } = fakeDeps();
  const value = await resolveMonitorValue(input('stage=pending'), deps);
  assert.equal(value, BUNDLE.byStage.pending); // 9 — the number queue-counts reports
  assert.equal(calls.outboundQueueCounts.length, 1);
  assert.equal(calls.boundedUnshippedCount.length, 0); // reused, not re-counted
});

test('stage=tested reads byStage.tested', async () => {
  const { deps } = fakeDeps();
  assert.equal(await resolveMonitorValue(input('stage=tested'), deps), BUNDLE.byStage.tested);
});

// ── Lane-accurate (ustatus) diverges from the coarse split ───────────────────

test('ustatus=PENDING is lane-accurate (6), NOT the coarse byStage.pending (9)', async () => {
  const { deps } = fakeDeps();
  assert.equal(await resolveMonitorValue(input('ustatus=PENDING'), deps), 6);
});

test('ustatus=TESTED counts only not-blocked tested rows (4)', async () => {
  const { deps } = fakeDeps();
  assert.equal(await resolveMonitorValue(input('ustatus=TESTED'), deps), 4);
});

test('ustatus=BLOCKED counts every out-of-stock row, tested or not (3+2=5)', async () => {
  const { deps } = fakeDeps();
  assert.equal(await resolveMonitorValue(input('ustatus=BLOCKED'), deps), 5);
});

test('ustatus wins over a co-present stage', async () => {
  const { deps } = fakeDeps();
  assert.equal(await resolveMonitorValue(input('stage=pending&ustatus=BLOCKED'), deps), 5);
});

// ── Other single facets ──────────────────────────────────────────────────────

test('attention=1 reads urgent', async () => {
  const { deps } = fakeDeps();
  assert.equal(await resolveMonitorValue(input('attention=1'), deps), BUNDLE.urgent);
});

test('packPlaced=1 reads totalPlaced', async () => {
  const { deps } = fakeDeps();
  assert.equal(await resolveMonitorValue(input('packPlaced=1'), deps), BUNDLE.packPlacement.totalPlaced);
});

test('packStation=N reads that location, unknown station → 0', async () => {
  const { deps } = fakeDeps();
  assert.equal(await resolveMonitorValue(input('packStation=10'), deps), 3);
  assert.equal(await resolveMonitorValue(input('packStation=99'), deps), 0);
});

test('no recognized facet → the whole queue total', async () => {
  const { deps } = fakeDeps();
  assert.equal(await resolveMonitorValue(input(''), deps), BUNDLE.total);
});

test('late is ignored (vestigial) — same as the whole queue', async () => {
  const { deps } = fakeDeps();
  assert.equal(await resolveMonitorValue(input('late=1'), deps), BUNDLE.total);
});

// ── Staff scope is applied to the bundle fetch ───────────────────────────────

test('staff scope is threaded into the aggregate fetch; an order facet needs no placement query', async () => {
  const { deps, calls } = fakeDeps();
  await resolveMonitorValue(input('ustatus=PENDING&staff=7'), deps);
  assert.deepEqual(calls.outboundQueueCounts, [{ staffId: 7, needsPlacement: false }]);
});

test('a placement facet requests the placement query (needsPlacement)', async () => {
  const { deps, calls } = fakeDeps();
  await resolveMonitorValue(input('packPlaced=1'), deps);
  assert.equal(calls.outboundQueueCounts[0]?.needsPlacement, true);
});

// ── Custom combos fall back to one bounded count ─────────────────────────────

test('two orthogonal facets (lane + placement) → bounded fallback, no aggregate', async () => {
  const { deps, calls } = fakeDeps();
  const value = await resolveMonitorValue(input('ustatus=PENDING&packPlaced=1'), deps);
  assert.equal(value, FALLBACK);
  assert.equal(calls.outboundQueueCounts.length, 0);
  assert.deepEqual(calls.boundedUnshippedCount[0], { lane: 'PENDING', packPlaced: true, staffId: undefined, coarseStage: undefined, packStationId: undefined, urgentOnly: undefined });
});

test('placement narrowed by staff → bounded fallback (placement is org-wide in the aggregate)', async () => {
  const { deps, calls } = fakeDeps();
  await resolveMonitorValue(input('packPlaced=1&staff=3'), deps);
  assert.equal(calls.outboundQueueCounts.length, 0);
  assert.equal(calls.boundedUnshippedCount.length, 1);
  assert.equal(calls.boundedUnshippedCount[0].staffId, 3);
  assert.equal(calls.boundedUnshippedCount[0].packPlaced, true);
});

// ── item_aging is always the bounded fallback ────────────────────────────────

test('item_aging → bounded fallback carrying agingOlderThanMs from agingHours', async () => {
  const { deps, calls } = fakeDeps();
  const value = await resolveMonitorValue(
    { monitorSurface: 'dashboard_unshipped', thresholdType: 'item_aging', monitorParams: { query: 'ustatus=PENDING', agingHours: 48 } },
    deps,
  );
  assert.equal(value, FALLBACK);
  assert.equal(calls.outboundQueueCounts.length, 0);
  assert.equal(calls.boundedUnshippedCount[0].agingOlderThanMs, 48 * 3_600_000);
  assert.equal(calls.boundedUnshippedCount[0].lane, 'PENDING');
});

test('item_aging without a valid agingHours throws', async () => {
  const { deps } = fakeDeps();
  await assert.rejects(
    resolveMonitorValue(
      { monitorSurface: 'dashboard_unshipped', thresholdType: 'item_aging', monitorParams: { query: '' } },
      deps,
    ),
    /agingHours/,
  );
});

// ── Snapshot shapes + unsupported surface ────────────────────────────────────

test('a flat params object (not { query }) is also parsed', async () => {
  const { deps } = fakeDeps();
  const value = await resolveMonitorValue(
    { monitorSurface: 'dashboard_unshipped', thresholdType: 'count_above', monitorParams: { ustatus: 'BLOCKED' } },
    deps,
  );
  assert.equal(value, 5);
});

test('an unsupported surface throws (arm UX only offers watchable surfaces)', async () => {
  const { deps } = fakeDeps();
  await assert.rejects(
    resolveMonitorValue({ monitorSurface: 'dashboard_shipped', thresholdType: 'count_above', monitorParams: {} }, deps),
    /unsupported surface/,
  );
});
