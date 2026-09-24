import test from 'node:test';
import assert from 'node:assert/strict';
import {
  benchMinutes,
  benchRowMeta,
  benchSessionElapsedMs,
  formatBenchClock,
  formatBenchDuration,
  serverClockOffsetMs,
  summarizeBenchSessions,
} from './bench-session';
import { canConsumeStock } from './repair-actions';

const T0 = Date.parse('2026-09-24T15:00:00.000Z');
const iso = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();
const MIN = 60_000;

test('elapsed: a stopped session is ended − started, whatever "now" is', () => {
  const s = { started_at: iso(0), ended_at: iso(25 * MIN) };
  assert.equal(benchSessionElapsedMs(s, T0 + 999 * MIN), 25 * MIN);
});

test('elapsed: an open session runs to the server now', () => {
  assert.equal(benchSessionElapsedMs({ started_at: iso(0), ended_at: null }, T0 + 90_000), 90_000);
});

test('elapsed: a server now before the start reads as zero, never negative', () => {
  assert.equal(benchSessionElapsedMs({ started_at: iso(0), ended_at: null }, T0 - 5_000), 0);
});

test('elapsed: unparseable stamps read as zero', () => {
  assert.equal(benchSessionElapsedMs({ started_at: 'garbage', ended_at: null }, T0), 0);
});

test('server clock offset: a phone 3 minutes slow still ticks from the server start', () => {
  const clientReceivedAt = T0 - 3 * MIN; // phone clock behind
  const offset = serverClockOffsetMs(iso(0), clientReceivedAt);
  assert.equal(offset, 3 * MIN);
  // 10s later on the phone's clock, the timer that started at server T0 shows 0:10.
  const serverNow = clientReceivedAt + 10_000 + offset;
  assert.equal(formatBenchClock(benchSessionElapsedMs({ started_at: iso(0), ended_at: null }, serverNow)), '0:10');
});

test('server clock offset: an unparseable server now leaves the client clock alone', () => {
  assert.equal(serverClockOffsetMs('', T0), 0);
});

test('minutes: rounds, but any time on the bench is at least one minute', () => {
  assert.equal(benchMinutes(0), 0);
  assert.equal(benchMinutes(20_000), 1);
  assert.equal(benchMinutes(89_000), 1);
  assert.equal(benchMinutes(91_000), 2);
});

test('clock face: m:ss under an hour, h:mm:ss after', () => {
  assert.equal(formatBenchClock(0), '0:00');
  assert.equal(formatBenchClock(12 * MIN + 5_000), '12:05');
  assert.equal(formatBenchClock(62 * MIN + 5_000), '1:02:05');
});

test('duration words cross the hour boundary', () => {
  assert.equal(formatBenchDuration(45 * MIN), '45 min');
  assert.equal(formatBenchDuration(65 * MIN), '1 h 05 min');
});

test('summary adds closed and running sessions and counts the running ones', () => {
  const sessions = [
    { started_at: iso(0), ended_at: iso(10 * MIN) },
    { started_at: iso(20 * MIN), ended_at: null },
  ];
  assert.deepEqual(summarizeBenchSessions(sessions, T0 + 25 * MIN), {
    count: 2,
    totalMs: 15 * MIN,
    runningCount: 1,
  });
});

test('hub meta: own running timer leads, total is not repeated while it runs', () => {
  const open = { started_at: iso(0), ended_at: null };
  const now = T0 + 4 * MIN + 2_000;
  const meta = benchRowMeta({
    open,
    summary: summarizeBenchSessions([open], now),
    actionCount: 1,
    serverNowMs: now,
  });
  assert.equal(meta, 'Timer running · 4:02 · 1 entry logged');
});

test('hub meta: someone else’s timer is named as running; totals show', () => {
  const sessions = [
    { started_at: iso(0), ended_at: iso(30 * MIN) },
    { started_at: iso(40 * MIN), ended_at: null },
  ];
  const now = T0 + 50 * MIN;
  const meta = benchRowMeta({ open: null, summary: summarizeBenchSessions(sessions, now), actionCount: 3, serverNowMs: now });
  assert.equal(meta, '1 timer running · 40 min on the bench · 3 entries logged');
});

test('hub meta: nothing yet', () => {
  const meta = benchRowMeta({
    open: null,
    summary: summarizeBenchSessions([], T0),
    actionCount: 0,
    serverNowMs: T0,
  });
  assert.equal(meta, 'Nothing logged yet');
});

test('stock consumption only for a new-stock replacement with a real catalog SKU', () => {
  const base = { actionType: 'replaced', donorSource: 'new_stock' as const, newSku: 'BOSE-123' };
  assert.equal(canConsumeStock(base), true);
  assert.equal(canConsumeStock({ ...base, actionType: 'repaired' }), false);
  assert.equal(canConsumeStock({ ...base, donorSource: 'donor_unit' }), false);
  assert.equal(canConsumeStock({ ...base, donorSource: 'customer_part' }), false);
  assert.equal(canConsumeStock({ ...base, donorSource: null }), false);
  assert.equal(canConsumeStock({ ...base, newSku: '   ' }), false);
  assert.equal(canConsumeStock({ ...base, newSku: null }), false);
  assert.equal(canConsumeStock({ ...base, newSku: 'TMP-0123456789' }), false);
});
