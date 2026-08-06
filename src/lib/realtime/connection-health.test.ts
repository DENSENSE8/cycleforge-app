import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  REALTIME_DEGRADED_LABEL,
  REALTIME_DEGRADE_GRACE_MS,
  classifyRealtimeState,
  isRealtimeDegraded,
} from './connection-health';

// ── classifyRealtimeState ────────────────────────────────────────────────────

test('connected is the only healthy Ably state', () => {
  assert.equal(classifyRealtimeState('connected'), 'healthy');
});

test('pre-init and connecting are unknown — never healthy', () => {
  // AuthenticatedAblyProvider does not mount a client for a signed-out visitor,
  // so the store sits at `initialized` forever on /signin. Claiming health there
  // would be a lie; claiming degradation would light chrome on a page with no
  // station link to begin with.
  for (const state of ['initialized', 'connecting', '', null, undefined, 'some_future_state']) {
    assert.equal(classifyRealtimeState(state), 'unknown', `${String(state)} must be unknown`);
  }
});

test('disconnected is wobbling, not degraded — Ably reconnects routinely', () => {
  assert.equal(classifyRealtimeState('disconnected'), 'wobbling');
  assert.equal(classifyRealtimeState('closing'), 'wobbling');
});

test('suspended and failed are degraded on sight', () => {
  // Ably only reaches `suspended` after retrying for ~30s, so it arrives
  // pre-debounced; `failed` is auth/config and will not self-heal.
  assert.equal(classifyRealtimeState('suspended'), 'degraded');
  assert.equal(classifyRealtimeState('failed'), 'degraded');
  assert.equal(classifyRealtimeState('closed'), 'degraded');
});

// ── isRealtimeDegraded (the debounce) ────────────────────────────────────────

test('a wobble under the grace period is not reported', () => {
  assert.equal(isRealtimeDegraded({ health: 'wobbling', heldMs: 0 }), false);
  assert.equal(
    isRealtimeDegraded({ health: 'wobbling', heldMs: REALTIME_DEGRADE_GRACE_MS - 1 }),
    false,
  );
});

test('a wobble that holds past the grace period is reported', () => {
  assert.equal(
    isRealtimeDegraded({ health: 'wobbling', heldMs: REALTIME_DEGRADE_GRACE_MS }),
    true,
  );
});

test('degraded skips the grace period entirely', () => {
  assert.equal(isRealtimeDegraded({ health: 'degraded', heldMs: 0 }), true);
});

test('unknown and healthy never report degraded, however long they hold', () => {
  assert.equal(isRealtimeDegraded({ health: 'unknown', heldMs: 10 * 60_000 }), false);
  assert.equal(isRealtimeDegraded({ health: 'healthy', heldMs: 10 * 60_000 }), false);
});

// ── wall label ───────────────────────────────────────────────────────────────

test('wall label is short and never Ably jargon', () => {
  assert.equal(REALTIME_DEGRADED_LABEL, 'Sync paused');
  assert.doesNotMatch(
    REALTIME_DEGRADED_LABEL,
    /ably|suspended|disconnected|connecting|websocket|channel|realtime/i,
  );
});
