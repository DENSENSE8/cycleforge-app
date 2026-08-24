/**
 * Duration and gap arithmetic — pure, no DB, no clock, no fake.
 *
 * Every input is a literal row and every "now" is a parameter, so these
 * assertions are exact rather than approximate. The rules under test are the
 * five stated in ./session-metrics.ts, and three of them exist to stop a report
 * making a claim about a person that the data does not support.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  activeDuration,
  classifyGap,
  gapBetween,
  parkedDuration,
  seriesTotals,
  sessionSeries,
  wallDuration,
} from './session-metrics';
import type { WorkSession, WorkSessionInterval } from './types';

const ORG = '00000000-0000-0000-0000-0000000000aa';
const MIN = 60_000;
const T = (minutes: number) => new Date(Date.parse('2026-08-22T08:00:00.000Z') + minutes * MIN).toISOString();

function session(over: Partial<WorkSession> & { id: number }): WorkSession {
  return {
    organizationId: ORG,
    kind: 'scan',
    scanType: 'unbox',
    armed: false,
    surfaceKey: 'unbox',
    status: 'ended',
    version: 1,
    staffId: 7,
    claimedByStaffId: null,
    claimExpiresAt: null,
    deviceId: null,
    clientEventId: `ce-${over.id}`,
    startedAt: T(0),
    endedAt: T(60),
    state: {},
    ...over,
  };
}

let intervalId = 0;
function interval(
  sessionId: number,
  kind: 'active' | 'parked',
  fromMin: number,
  toMin: number | null,
  staffId: number | null = 7,
): WorkSessionInterval {
  return {
    id: ++intervalId,
    organizationId: ORG,
    sessionId,
    kind,
    startedAt: T(fromMin),
    endedAt: toMin === null ? null : T(toMin),
    staffId,
  };
}

// ── durations ───────────────────────────────────────────────────────────────

test('activeDuration excludes parked stretches', () => {
  const s = session({ id: 1, startedAt: T(0), endedAt: T(60) });
  const intervals = [
    interval(1, 'active', 0, 10),
    interval(1, 'parked', 10, 15),
    interval(1, 'active', 15, 35),
    interval(1, 'parked', 35, 38),
    interval(1, 'active', 38, 60),
  ];

  const active = activeDuration(s, intervals, T(60));
  const parked = parkedDuration(s, intervals, T(60));
  const wall = wallDuration(s, T(60));

  assert.equal(active.ms, 52 * MIN, '10 + 20 + 22');
  assert.equal(parked.ms, 8 * MIN, '5 + 3');
  assert.equal(wall.ms, 60 * MIN);
  // The tiling check: a drift here means a writer opened without closing.
  assert.equal(active.ms + parked.ms, wall.ms);
  assert.equal(active.provisional, false);
});

test('intervals belonging to another session are not folded in', () => {
  const s = session({ id: 1 });
  const intervals = [interval(1, 'active', 0, 10), interval(2, 'active', 0, 45)];
  assert.equal(activeDuration(s, intervals, T(60)).ms, 10 * MIN);
});

test('an OPEN session has no duration — only a provisional elapsed', () => {
  const s = session({ id: 1, status: 'open', endedAt: null });
  const intervals = [interval(1, 'active', 0, null)];

  const active = activeDuration(s, intervals, T(25));
  assert.equal(active.ms, 25 * MIN, 'elapsed so far, measured to dbNow');
  assert.equal(active.provisional, true, 'and flagged as not final');
  assert.equal(wallDuration(s, T(25)).provisional, true);
});

test('a session with no intervals is UNMEASURED, not zero', () => {
  const s = session({ id: 1 });
  const active = activeDuration(s, [], T(60));
  assert.equal(active.ms, 0);
  assert.equal(active.measured, false, 'rendering this as "0m" would be a lie');
  // Contrast: a session that really was never active for any time.
  const zero = activeDuration(s, [interval(1, 'active', 0, 0)], T(60));
  assert.equal(zero.ms, 0);
  assert.equal(zero.measured, true);
});

// ── gaps ────────────────────────────────────────────────────────────────────

const SHIFT = [{ punchedInAt: T(-60), punchedOutAt: T(600) }];

test('gapBetween returns nothing before the first session of a shift', () => {
  const first = session({ id: 1, startedAt: T(0) });
  assert.equal(gapBetween(null, first, SHIFT, T(600)), null);
  assert.equal(gapBetween(undefined, first, SHIFT, T(600)), null);
});

test('gapBetween returns nothing when the previous session has not ended', () => {
  const open = session({ id: 1, status: 'open', endedAt: null });
  const next = session({ id: 2, startedAt: T(90) });
  assert.equal(gapBetween(open, next, SHIFT, T(600)), null);
});

test('overlapping sessions are not a zero-length gap', () => {
  const prev = session({ id: 1, endedAt: T(60) });
  const next = session({ id: 2, startedAt: T(45) });
  // Reporting a negative span as 0 would hide that two benches ran at once.
  assert.equal(gapBetween(prev, next, SHIFT, T(600)), null);
});

test('a gap inside one shift is idle', () => {
  const prev = session({ id: 1, endedAt: T(60) });
  const next = session({ id: 2, startedAt: T(74) });

  const gap = gapBetween(prev, next, SHIFT, T(600));
  assert.ok(gap);
  assert.equal(gap.ms, 14 * MIN);
  assert.equal(gap.classification, 'idle');
  assert.equal(gap.fromSessionId, 1);
  assert.equal(gap.toSessionId, 2);
});

test('a gap crossing a shift boundary is OFF-CLOCK, not idle', () => {
  // Tuesday afternoon → Wednesday morning. Sixteen hours apart, and the
  // staffer was clocked out for all but the ends of it.
  const prev = session({ id: 1, endedAt: T(480) });
  const next = session({ id: 2, startedAt: T(1440) });
  const punches = [
    { punchedInAt: T(-60), punchedOutAt: T(500) },   // Tuesday
    { punchedInAt: T(1400), punchedOutAt: T(1900) }, // Wednesday
  ];

  const gap = gapBetween(prev, next, punches, T(1900));
  assert.ok(gap);
  assert.equal(gap.ms, 960 * MIN);
  // Filing this as idle would be a report accusing someone of doing nothing
  // overnight.
  assert.equal(gap.classification, 'off-clock');
});

test('one uncovered minute is enough to make a gap off-clock', () => {
  const punches = [
    { punchedInAt: T(0), punchedOutAt: T(30) },
    { punchedInAt: T(31), punchedOutAt: T(90) },  // a one-minute hole at T(30)
  ];
  assert.equal(classifyGap(T(10), T(80), punches, T(90)), 'off-clock');
  // Contiguous punches (a break recorded as two rows) stay idle.
  const contiguous = [
    { punchedInAt: T(0), punchedOutAt: T(30) },
    { punchedInAt: T(30), punchedOutAt: T(90) },
  ];
  assert.equal(classifyGap(T(10), T(80), contiguous, T(90)), 'idle');
});

test('no payroll context yields UNKNOWN, never idle by default', () => {
  // null = "payroll was not consulted". The defaulting direction is the
  // accusation, so the module refuses to guess.
  assert.equal(classifyGap(T(10), T(80), null, T(90)), 'unknown');
  // An EMPTY array is a real answer — no punch covers this span.
  assert.equal(classifyGap(T(10), T(80), [], T(90)), 'off-clock');
});

test('a still-open punch covers up to dbNow', () => {
  const punches = [{ punchedInAt: T(0), punchedOutAt: null }];
  assert.equal(classifyGap(T(10), T(80), punches, T(200)), 'idle');
});

// ── series ──────────────────────────────────────────────────────────────────

test('sessionSeries orders oldest-first and interleaves the gaps', () => {
  // Deliberately passed newest-first, the way the rollup paginates.
  const sessions = [
    session({ id: 3, startedAt: T(200), endedAt: T(240) }),
    session({ id: 2, startedAt: T(90), endedAt: T(150) }),
    session({ id: 1, startedAt: T(0), endedAt: T(60) }),
  ];
  const intervals = [
    interval(1, 'active', 0, 60),
    interval(2, 'active', 90, 120),
    interval(2, 'parked', 120, 150),
    interval(3, 'active', 200, 240),
  ];

  const series = sessionSeries({ sessions, intervals, punches: SHIFT, dbNow: T(600) });

  assert.deepEqual(series.map((m) => m.sessionId), [1, 2, 3], 'oldest first');
  assert.equal(series[0].gapBefore, null, 'the first session has no gap before it');
  assert.equal(series[1].gapBefore?.ms, 30 * MIN);
  assert.equal(series[2].gapBefore?.ms, 50 * MIN);
  assert.equal(series[1].active.ms, 30 * MIN);
  assert.equal(series[1].parked.ms, 30 * MIN);
});

test('workedByStaffIds names everyone who worked a handed-over session', () => {
  const sessions = [session({ id: 1, staffId: 11 })];
  const intervals = [
    interval(1, 'active', 0, 30, 11),
    interval(1, 'parked', 30, 34, 11),
    interval(1, 'active', 34, 60, 22),
  ];
  const [metric] = sessionSeries({ sessions, intervals, punches: null, dbNow: T(60) });
  assert.deepEqual(metric.workedByStaffIds, [11, 22]);
  assert.equal(metric.staffId, 11, 'the session still belongs to its owner');
});

test('seriesTotals keeps idle and off-clock apart, and carries provisional forward', () => {
  const sessions = [
    session({ id: 1, startedAt: T(0), endedAt: T(60) }),
    session({ id: 2, startedAt: T(74), endedAt: T(100) }),
    session({ id: 3, startedAt: T(1440), status: 'open', endedAt: null }),
  ];
  const intervals = [
    interval(1, 'active', 0, 60),
    interval(2, 'active', 74, 100),
    interval(3, 'active', 1440, null),
  ];
  const punches = [
    { punchedInAt: T(-60), punchedOutAt: T(200) },
    { punchedInAt: T(1400), punchedOutAt: null },
  ];

  const totals = seriesTotals(sessionSeries({ sessions, intervals, punches, dbNow: T(1500) }));

  assert.equal(totals.sessionCount, 3);
  assert.equal(totals.idleBetween.ms, 14 * MIN, 'the within-shift gap only');
  assert.equal(totals.offClockBetween.ms, 1340 * MIN, 'the overnight gap, separately');
  assert.equal(totals.unknownBetween.measured, false);
  assert.equal(totals.active.provisional, true, 'one session is still running');
  assert.equal(totals.active.ms, (60 + 26 + 60) * MIN);
});
