import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  REALTIME_DEGRADED_MESSAGE,
  REALTIME_DEGRADE_GRACE_MS,
  classifyRealtimeState,
  isRealtimeDegraded,
  resolveConnectionChrome,
} from './connection-health';

// ── classifyRealtimeState ────────────────────────────────────────────────────

test('connected is the only healthy Ably state', () => {
  assert.equal(classifyRealtimeState('connected'), 'healthy');
});

test('pre-init and connecting are unknown — never healthy', () => {
  // AuthenticatedAblyProvider does not mount a client for a signed-out visitor,
  // so the store sits at `initialized` forever on /signin. Claiming health there
  // would be a lie; claiming degradation would light the banner on a page with
  // no station link to begin with.
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

// ── resolveConnectionChrome (the precedence ladder) ──────────────────────────

const base = { online: true, realtimeDegraded: false, queueDepth: 0, recovered: false };

test('nothing wrong renders nothing', () => {
  assert.equal(resolveConnectionChrome(base).kind, 'hidden');
});

test('THE defect: a dead realtime link is visible while the browser is online', () => {
  const chrome = resolveConnectionChrome({ ...base, realtimeDegraded: true });
  assert.equal(chrome.kind, 'realtime-degraded');
  assert.equal(chrome.message, REALTIME_DEGRADED_MESSAGE);
});

test('browser offline outranks everything — it explains the other symptoms', () => {
  const chrome = resolveConnectionChrome({
    ...base,
    online: false,
    realtimeDegraded: true,
    queueDepth: 3,
    recovered: true,
  });
  assert.equal(chrome.kind, 'offline');
  assert.match(chrome.message, /3 changes queued/);
});

test('a paused link outranks a draining queue', () => {
  // A queue with depth is visibly self-resolving; a paused link is the silent
  // failure, and the silent one is what the banner exists for.
  const chrome = resolveConnectionChrome({ ...base, realtimeDegraded: true, queueDepth: 2 });
  assert.equal(chrome.kind, 'realtime-degraded');
});

test('a draining queue is reported when the link is fine', () => {
  const chrome = resolveConnectionChrome({ ...base, queueDepth: 1 });
  assert.equal(chrome.kind, 'syncing');
  assert.match(chrome.message, /1 queued change/);
});

test('recovery is the weakest signal', () => {
  assert.equal(resolveConnectionChrome({ ...base, recovered: true }).kind, 'recovered');
  assert.equal(
    resolveConnectionChrome({ ...base, recovered: true, queueDepth: 1 }).kind,
    'syncing',
  );
});

test('offline copy pluralises honestly', () => {
  assert.match(
    resolveConnectionChrome({ ...base, online: false, queueDepth: 1 }).message,
    /1 change queued/,
  );
  assert.match(
    resolveConnectionChrome({ ...base, online: false, queueDepth: 0 }).message,
    /edits queue until you reconnect/,
  );
});

test('no operator-facing copy leaks Ably jargon', () => {
  const messages = [
    resolveConnectionChrome({ ...base, online: false }),
    resolveConnectionChrome({ ...base, online: false, queueDepth: 2 }),
    resolveConnectionChrome({ ...base, realtimeDegraded: true }),
    resolveConnectionChrome({ ...base, queueDepth: 2 }),
    resolveConnectionChrome({ ...base, recovered: true }),
  ].map((c) => c.message);

  for (const message of messages) {
    assert.doesNotMatch(
      message,
      /ably|suspended|disconnected|connecting|websocket|channel|realtime/i,
      `operator copy must not name the mechanism: "${message}"`,
    );
  }
});

test('the degraded line says what still works', () => {
  // "Station sync paused" alone reads as "stop scanning". An operator who stops
  // is worse off than one who was told nothing — scans still record locally.
  assert.match(REALTIME_DEGRADED_MESSAGE, /still save/);
});
