import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateViewMonitor,
  type ViewMonitorDef,
  type ViewMonitorRuntime,
} from './evaluate';

/** Pure state-machine tests — no DB, no clock. */

const NOW = new Date('2026-08-10T12:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

function def(overrides: Partial<ViewMonitorDef> = {}): ViewMonitorDef {
  return {
    thresholdType: 'count_above',
    thresholdValue: 40,
    recoveryValue: null,
    cooldownMs: null,
    ...overrides,
  };
}

const ARMED: ViewMonitorRuntime = { state: 'armed', breachedAt: null, lastFiredAt: null };
function breached(overrides: Partial<ViewMonitorRuntime> = {}): ViewMonitorRuntime {
  return { state: 'breached', breachedAt: minutesAgo(10), lastFiredAt: minutesAgo(10), ...overrides };
}

// ── Fires once on crossing ───────────────────────────────────────────────────

test('count_above: armed + over the line → fires breach once, transitions to breached', () => {
  const r = evaluateViewMonitor(def(), ARMED, 41, NOW);
  assert.equal(r.fire, 'breach');
  assert.equal(r.nextState, 'breached');
  assert.deepEqual(r.breachedAt, NOW);
});

test('count_above: armed + exactly at the threshold → NOT over, stays armed silent', () => {
  const r = evaluateViewMonitor(def(), ARMED, 40, NOW);
  assert.equal(r.fire, undefined);
  assert.equal(r.nextState, 'armed');
  assert.equal(r.breachedAt, null);
});

test('count_above: armed + below threshold → stays armed silent', () => {
  const r = evaluateViewMonitor(def(), ARMED, 12, NOW);
  assert.equal(r.fire, undefined);
  assert.equal(r.nextState, 'armed');
});

// ── Silent while breached (no cooldown, no recovery band) ────────────────────

test('count_above: breached + still over, no cooldown → silent, stays breached, keeps episode', () => {
  const st = breached();
  const r = evaluateViewMonitor(def(), st, 41, NOW);
  assert.equal(r.fire, undefined);
  assert.equal(r.nextState, 'breached');
  assert.deepEqual(r.breachedAt, st.breachedAt); // episode start unchanged
});

// ── Recovery on drop below recovery_value ────────────────────────────────────

test('count_above: breached + drops below recovery_value → fires recovery, re-arms', () => {
  const r = evaluateViewMonitor(def({ recoveryValue: 30 }), breached(), 29, NOW);
  assert.equal(r.fire, 'recovery');
  assert.equal(r.nextState, 'armed');
  assert.equal(r.breachedAt, null);
});

test('count_above: breached + in the hysteresis dead-band (recovery < value ≤ threshold) → silent, stays breached', () => {
  const r = evaluateViewMonitor(def({ recoveryValue: 30 }), breached(), 35, NOW);
  assert.equal(r.fire, undefined);
  assert.equal(r.nextState, 'breached');
});

test('count_above: breached + exactly at recovery_value (not strictly below) → still in band, silent', () => {
  const r = evaluateViewMonitor(def({ recoveryValue: 30 }), breached(), 30, NOW);
  assert.equal(r.fire, undefined);
  assert.equal(r.nextState, 'breached');
});

test('recovery_value null → band collapses to the threshold: breached + no longer over → recovery', () => {
  const r = evaluateViewMonitor(def({ recoveryValue: null }), breached(), 40, NOW);
  assert.equal(r.fire, 'recovery');
  assert.equal(r.nextState, 'armed');
});

test('re-arm then back over the line → a NEW breach fires (no cooldown gate on the armed→breach edge)', () => {
  const r = evaluateViewMonitor(def({ recoveryValue: 30 }), ARMED, 41, NOW);
  assert.equal(r.fire, 'breach');
  assert.equal(r.nextState, 'breached');
});

// ── Cooldown suppresses re-fire (throttled repeat while breached) ────────────

test('cooldown: breached + still over + cooldown NOT elapsed → suppressed (silent)', () => {
  const d = def({ cooldownMs: 5 * 60_000 }); // 5 min
  const st = breached({ lastFiredAt: minutesAgo(2) }); // last fired 2 min ago
  const r = evaluateViewMonitor(d, st, 41, NOW);
  assert.equal(r.fire, undefined);
  assert.equal(r.nextState, 'breached');
});

test('cooldown: breached + still over + cooldown elapsed → throttled repeat breach, episode unchanged', () => {
  const d = def({ cooldownMs: 5 * 60_000 });
  const st = breached({ breachedAt: minutesAgo(30), lastFiredAt: minutesAgo(6) });
  const r = evaluateViewMonitor(d, st, 41, NOW);
  assert.equal(r.fire, 'breach');
  assert.equal(r.nextState, 'breached');
  assert.deepEqual(r.breachedAt, st.breachedAt); // still the SAME episode, not a new one
});

test('cooldown null → no repeats ever, even long into a persistent breach', () => {
  const st = breached({ breachedAt: minutesAgo(600), lastFiredAt: minutesAgo(600) });
  const r = evaluateViewMonitor(def({ cooldownMs: null }), st, 41, NOW);
  assert.equal(r.fire, undefined);
  assert.equal(r.nextState, 'breached');
});

test('cooldown: elapsed but value back in dead-band (not over) → no repeat (repeats need a live breach)', () => {
  const d = def({ recoveryValue: 30, cooldownMs: 5 * 60_000 });
  const st = breached({ lastFiredAt: minutesAgo(60) });
  const r = evaluateViewMonitor(d, st, 35, NOW); // dead-band
  assert.equal(r.fire, undefined);
  assert.equal(r.nextState, 'breached');
});

// ── count_below directionality (mirror image) ────────────────────────────────

test('count_below: armed + value drops below threshold → fires breach', () => {
  const r = evaluateViewMonitor(def({ thresholdType: 'count_below', thresholdValue: 5 }), ARMED, 3, NOW);
  assert.equal(r.fire, 'breach');
  assert.equal(r.nextState, 'breached');
});

test('count_below: armed + at threshold (not below) → silent', () => {
  const r = evaluateViewMonitor(def({ thresholdType: 'count_below', thresholdValue: 5 }), ARMED, 5, NOW);
  assert.equal(r.fire, undefined);
  assert.equal(r.nextState, 'armed');
});

test('count_below: breached + climbs above recovery_value → recovery', () => {
  const d = def({ thresholdType: 'count_below', thresholdValue: 5, recoveryValue: 6 });
  const r = evaluateViewMonitor(d, breached(), 7, NOW);
  assert.equal(r.fire, 'recovery');
  assert.equal(r.nextState, 'armed');
});

test('count_below: breached + at recovery edge (not strictly above) → still in band, silent', () => {
  const d = def({ thresholdType: 'count_below', thresholdValue: 5, recoveryValue: 6 });
  const r = evaluateViewMonitor(d, breached(), 6, NOW);
  assert.equal(r.fire, undefined);
  assert.equal(r.nextState, 'breached');
});

// ── item_aging path (count-of-aged-items, above-semantics like count_above) ──

test('item_aging: armed + aged-item count over the count bound → fires breach', () => {
  // threshold 0 = "alert if ANY item is older than the age bound" (age bound
  // lives in monitor_params, applied by the resolver).
  const r = evaluateViewMonitor(def({ thresholdType: 'item_aging', thresholdValue: 0 }), ARMED, 3, NOW);
  assert.equal(r.fire, 'breach');
  assert.equal(r.nextState, 'breached');
});

test('item_aging: armed + zero aged items (at the bound) → silent', () => {
  const r = evaluateViewMonitor(def({ thresholdType: 'item_aging', thresholdValue: 0 }), ARMED, 0, NOW);
  assert.equal(r.fire, undefined);
  assert.equal(r.nextState, 'armed');
});

test('item_aging: breached + aged count clears to zero (recovery null) → recovery', () => {
  const r = evaluateViewMonitor(def({ thresholdType: 'item_aging', thresholdValue: 0 }), breached(), 0, NOW);
  assert.equal(r.fire, 'recovery');
  assert.equal(r.nextState, 'armed');
});

// ── scheduled_digest is not a threshold ──────────────────────────────────────

test('scheduled_digest routed through the threshold evaluator throws (programming error)', () => {
  assert.throws(
    () => evaluateViewMonitor(def({ thresholdType: 'scheduled_digest' }), ARMED, 99, NOW),
    /scheduled_digest/,
  );
});
