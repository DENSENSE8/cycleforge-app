/**
 * Interval sequencing — park / resume / end, and who worked which stretch.
 *
 * DB-free, on the shared fake in ./work-sessions.fake.ts, which enforces
 * `ux_work_session_intervals_open` (at most one open interval per session) the
 * way Postgres does. A writer that opened a stretch without closing the last
 * one fails here rather than at 2am against the real index.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { FAKE_ORG as ORG, fakes } from './work-sessions.fake';
import {
  armScanSession,
  endSession,
  parkSession,
  resumeSession,
  startSession,
} from './work-sessions';

const MIN = 60_000;

/** `[kind, staffId, minutesLong | null]` — null = still open. */
function shape(intervals: Array<Record<string, unknown>>) {
  return intervals.map((i) => [
    i.kind,
    i.staff_id,
    i.ended_at == null
      ? null
      : (Date.parse(String(i.ended_at)) - Date.parse(String(i.started_at))) / MIN,
  ]);
}

test('park → resume → park → end produces exactly the expected interval sequence', async () => {
  const f = fakes();

  const started = await startSession(
    { orgId: ORG, kind: 'scan', scanType: 'unbox', surfaceKey: 'unbox', staffId: 7, arm: true },
    f.deps,
  );
  assert.ok(started.ok);
  const id = started.session.id;

  f.advance(10 * MIN);
  assert.ok((await parkSession({ orgId: ORG, sessionId: id, staffId: 7 }, f.deps)).ok);

  f.advance(5 * MIN);
  assert.ok((await resumeSession({ orgId: ORG, sessionId: id, staffId: 7 }, f.deps)).ok);

  f.advance(20 * MIN);
  assert.ok((await parkSession({ orgId: ORG, sessionId: id, staffId: 7 }, f.deps)).ok);

  f.advance(3 * MIN);
  assert.ok((await endSession({ orgId: ORG, sessionId: id }, f.deps)).ok);

  assert.deepEqual(shape(f.intervals), [
    ['active', 7, 10],   // start → first park
    ['parked', 7, 5],    // first park → resume
    ['active', 7, 20],   // resume → second park
    ['parked', 7, 3],    // second park → end
  ]);

  // The session is over, so NOTHING may still be open — a dangling interval
  // would make every later duration read grow forever against `dbNow`.
  assert.equal(
    f.intervals.filter((i) => i.ended_at == null).length,
    0,
    'end() closes whatever was open',
  );
});

test('a session resumed by a different staffer attributes each interval to the right person', async () => {
  const f = fakes();

  // Ana starts and works it.
  const started = await startSession(
    { orgId: ORG, kind: 'scan', scanType: 'triage', staffId: 11 }, f.deps,
  );
  assert.ok(started.ok);
  const id = started.session.id;

  f.advance(30 * MIN);
  await parkSession({ orgId: ORG, sessionId: id, staffId: 11 }, f.deps);

  // Marco, a lead, picks it up.
  f.advance(4 * MIN);
  const resumed = await resumeSession({ orgId: ORG, sessionId: id, staffId: 22 }, f.deps);
  assert.ok(resumed.ok);
  assert.equal(resumed.session.claimedByStaffId, 22, 'the lease moved to Marco');
  assert.equal(resumed.session.staffId, 11, "but the session is still Ana's");

  f.advance(15 * MIN);
  await endSession({ orgId: ORG, sessionId: id }, f.deps);

  assert.deepEqual(shape(f.intervals), [
    ['active', 11, 30],  // Ana's stretch
    ['parked', 11, 4],
    ['active', 22, 15],  // Marco's stretch — NOT credited to Ana
  ]);
});

test('a lease renewal by the SAME staffer does not shred the stretch', async () => {
  const f = fakes();
  const started = await startSession({ orgId: ORG, kind: 'task', surfaceKey: 'incoming', staffId: 5 }, f.deps);
  assert.ok(started.ok);

  // Three renewals in a row — a mounted shell re-claiming its lease.
  for (let i = 0; i < 3; i += 1) {
    f.advance(2 * MIN);
    assert.ok((await resumeSession({ orgId: ORG, sessionId: started.session.id, staffId: 5 }, f.deps)).ok);
  }

  assert.equal(f.intervals.length, 1, 'still ONE active stretch, not four');
  assert.equal(f.intervals[0].kind, 'active');
  assert.equal(f.intervals[0].ended_at, null);
});

test('a handover on an OPEN session still splits the stretch', async () => {
  const f = fakes();
  const started = await startSession({ orgId: ORG, kind: 'task', staffId: 5 }, f.deps);
  assert.ok(started.ok);

  f.advance(9 * MIN);
  // Not parked first — a lead takes a live session straight over.
  assert.ok((await resumeSession({ orgId: ORG, sessionId: started.session.id, staffId: 6 }, f.deps)).ok);

  assert.deepEqual(shape(f.intervals), [
    ['active', 5, 9],
    ['active', 6, null],
  ]);
});

test('a replayed start does not open a second interval', async () => {
  const f = fakes();
  const key = '22222222-2222-2222-2222-222222222222';

  const first = await startSession(
    { orgId: ORG, kind: 'task', staffId: 3, clientEventId: key }, f.deps,
  );
  assert.ok(first.ok);
  assert.equal(first.idempotent, false);

  f.advance(MIN);
  const replay = await startSession(
    { orgId: ORG, kind: 'task', staffId: 3, clientEventId: key }, f.deps,
  );
  assert.ok(replay.ok);
  assert.equal(replay.idempotent, true);

  // A second open interval would trip ux_work_session_intervals_open — the
  // retry must be a true no-op, not a 500.
  assert.equal(f.intervals.length, 1);
});

test('parking an already-parked session is idempotent and writes no interval', async () => {
  const f = fakes();
  const started = await startSession({ orgId: ORG, kind: 'task', staffId: 3 }, f.deps);
  assert.ok(started.ok);

  f.advance(MIN);
  await parkSession({ orgId: ORG, sessionId: started.session.id }, f.deps);
  const before = f.intervals.length;

  f.advance(MIN);
  const again = await parkSession({ orgId: ORG, sessionId: started.session.id }, f.deps);
  assert.ok(again.ok);
  assert.equal(again.idempotent, true);
  assert.equal(f.intervals.length, before, 'no second parked stretch');
});

test('ending an already-ended session is idempotent, not an error', async () => {
  const f = fakes();
  const started = await startSession({ orgId: ORG, kind: 'task', staffId: 3 }, f.deps);
  assert.ok(started.ok);

  f.advance(MIN);
  const first = await endSession({ orgId: ORG, sessionId: started.session.id }, f.deps);
  assert.ok(first.ok);
  assert.equal(first.idempotent, false);
  const version = first.session.version;

  f.advance(MIN);
  const second = await endSession({ orgId: ORG, sessionId: started.session.id }, f.deps);
  assert.ok(second.ok, 're-ending is a retry, not a 409');
  assert.equal(second.idempotent, true);
  assert.equal(second.session.version, version, 'no version bump for a no-op');
  assert.equal(second.session.endedAt, first.session.endedAt, 'ended_at is not moved');
});

test('a stale version loses and REPORTS the current one', async () => {
  const f = fakes();
  const started = await startSession({ orgId: ORG, kind: 'task', staffId: 3 }, f.deps);
  assert.ok(started.ok);

  // Someone else parks it first, bumping version.
  await parkSession({ orgId: ORG, sessionId: started.session.id }, f.deps);

  const stale = await endSession(
    { orgId: ORG, sessionId: started.session.id, expectedVersion: started.session.version },
    f.deps,
  );
  assert.equal(stale.ok, false);
  assert.ok(!stale.ok);
  assert.equal(stale.status, 409);
  assert.equal(stale.error, 'VERSION_CONFLICT');
  // A bare 409 leaves the client guessing what it lost to; on a floor network a
  // guess is how two devices ping-pong the same session.
  assert.equal(stale.currentVersion, 1);
});

test('losing the arm race is a normal outcome, not a 500', async () => {
  const f = fakes();

  const winner = await startSession({ orgId: ORG, kind: 'scan', scanType: 'pack' }, f.deps);
  const loser = await startSession({ orgId: ORG, kind: 'scan', scanType: 'unbox' }, f.deps);
  assert.ok(winner.ok && loser.ok);

  // Another device commits its arm between our disarm and our arm.
  f.raceOnNextArm(winner.session.id);

  const result = await armScanSession({ orgId: ORG, sessionId: loser.session.id }, f.deps);
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  assert.equal(result.status, 409, 'a lost race is a 409, never a 500');
  assert.equal(result.error, 'ARM_RACE_LOST');
  assert.equal(result.armedSessionId, winner.session.id, 'and it names who won');

  // The index invariant held throughout.
  assert.equal(f.rows.filter((r) => r.kind === 'scan' && r.armed === true).length, 1);
});

test('starting-with-arm that loses the race still returns a usable session', async () => {
  const f = fakes();
  const winner = await startSession({ orgId: ORG, kind: 'scan', scanType: 'pack' }, f.deps);
  assert.ok(winner.ok);

  f.raceOnNextArm(winner.session.id);
  const started = await startSession(
    { orgId: ORG, kind: 'scan', scanType: 'unbox', arm: true }, f.deps,
  );

  // A 409 here would make the client re-POST for a row it already has, over a
  // floor network, for a case that is not an error.
  assert.ok(started.ok);
  assert.equal(started.session.armed, false);
  assert.equal(started.armRaceLostTo, winner.session.id);
});
