/**
 * work_sessions domain — DB-free, driven by the shared in-memory fake in
 * ./work-sessions.fake.ts, which ENFORCES the partial unique indexes the real
 * tables carry. If a code path ever tried to hold two armed scan sessions in
 * one tenant, or to open a second interval on one session, the fake throws
 * exactly where Postgres would.
 *
 * Interval sequencing has its own file (./work-session-intervals.test.ts) so
 * this one stays about the lifecycle and the one-armed rule.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { FAKE_ORG as ORG, fakes } from './work-sessions.fake';
import {
  armScanSession,
  beginSession,
  endSession,
  getArmedScanSession,
  parkSession,
  renameSession,
  resumeSession,
  startSession,
} from './work-sessions';
import { attributionOf } from './attribution';

// ── the one-armed rule ──────────────────────────────────────────────────────

test('arming B disarms A — one armed scan session survives', async () => {
  const f = fakes();

  const a = await startSession(
    { orgId: ORG, kind: 'scan', scanType: 'unbox', surfaceKey: 'unbox', arm: true },
    f.deps,
  );
  assert.equal(a.ok, true);
  assert.ok(a.ok && a.session.armed, 'A is armed');

  const b = await startSession(
    { orgId: ORG, kind: 'scan', scanType: 'test', surfaceKey: 'test' },
    f.deps,
  );
  assert.ok(b.ok);
  assert.equal(b.session.armed, false, 'B starts unarmed');

  const armed = await armScanSession({ orgId: ORG, sessionId: b.session.id }, f.deps);
  assert.ok(armed.ok);
  assert.equal(armed.session.armed, true);
  assert.deepEqual(
    armed.disarmedSessionIds,
    [a.ok ? a.session.id : -1],
    'arming B reports that it took the wedge from A',
  );

  const live = await getArmedScanSession({ orgId: ORG }, f.deps);
  assert.equal(live?.id, b.session.id, 'B owns the wedge');

  const armedRows = f.rows.filter((r) => r.kind === 'scan' && r.armed === true);
  assert.equal(armedRows.length, 1, 'exactly one armed scan session app-wide');
});

test('the disarm statement runs BEFORE the arm statement', async () => {
  const f = fakes();
  const a = await startSession({ orgId: ORG, kind: 'scan', scanType: 'unbox', arm: true }, f.deps);
  assert.ok(a.ok);
  const b = await startSession({ orgId: ORG, kind: 'scan', scanType: 'pack' }, f.deps);
  assert.ok(b.ok);

  f.sql.length = 0;
  await armScanSession({ orgId: ORG, sessionId: b.session.id }, f.deps);

  const disarmAt = f.sql.findIndex((s) => s.includes('SET armed = false'));
  const armAt = f.sql.findIndex((s) => s.includes('SET armed = true'));
  assert.ok(disarmAt >= 0 && armAt >= 0, 'both statements ran');
  assert.ok(disarmAt < armAt, 'disarm must precede arm — the index is not deferrable');
});

test('re-arming the session that already holds the wedge is idempotent', async () => {
  const f = fakes();
  const a = await startSession({ orgId: ORG, kind: 'scan', scanType: 'unbox', arm: true }, f.deps);
  assert.ok(a.ok);

  const again = await armScanSession({ orgId: ORG, sessionId: a.session.id }, f.deps);
  assert.ok(again.ok);
  assert.equal(again.idempotent, true);
  assert.equal(again.session.version, a.session.version, 'no version bump for a no-op');
});

// ── kind / scanType is an iff ───────────────────────────────────────────────

test('a task session never carries a scanType', async () => {
  const f = fakes();

  const rejected = await startSession(
    // @ts-expect-error — the union gives a task session nowhere to put a
    // scanType; the runtime guard catches a body cast through the type.
    { orgId: ORG, kind: 'task', scanType: 'unbox' },
    f.deps,
  );
  assert.equal(rejected.ok, false);
  assert.equal(rejected.ok === false && rejected.status, 400);
  assert.equal(rejected.ok === false && rejected.error, 'TASK_SESSION_MUST_NOT_CARRY_SCAN_TYPE');
  assert.equal(f.rows.length, 0, 'nothing was written');

  const ok = await startSession({ orgId: ORG, kind: 'task', surfaceKey: 'incoming' }, f.deps);
  assert.ok(ok.ok);
  assert.equal(ok.session.scanType, null);
  assert.equal(ok.session.armed, false);
});

test('a scan session without a scanType is refused', async () => {
  const f = fakes();
  // @ts-expect-error — the union requires scanType on a scan; the runtime guard
  // is what catches an untrusted body cast through it.
  const r = await startSession({ orgId: ORG, kind: 'scan' }, f.deps);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.error, 'SCAN_SESSION_REQUIRES_SCAN_TYPE');
});

test('an unknown scanType is refused before it reaches the CHECK', async () => {
  const f = fakes();
  const r = await startSession(
    // @ts-expect-error — deliberately outside SCAN_SESSION_TYPES.
    { orgId: ORG, kind: 'scan', scanType: 'teleport' },
    f.deps,
  );
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.error, 'UNKNOWN_SCAN_TYPE');
});

test('a task session cannot be armed', async () => {
  const f = fakes();
  const t = await startSession({ orgId: ORG, kind: 'task', surfaceKey: 'support' }, f.deps);
  assert.ok(t.ok);

  const r = await armScanSession({ orgId: ORG, sessionId: t.session.id }, f.deps);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.status, 409);
  assert.equal(r.ok === false && r.error, 'ONLY_A_SCAN_SESSION_CAN_ARM');
});

// ── lifecycle ───────────────────────────────────────────────────────────────

test('start is idempotent on client_event_id', async () => {
  const f = fakes();
  const first = await startSession(
    { orgId: ORG, kind: 'task', clientEventId: 'ce-1' },
    f.deps,
  );
  const retry = await startSession(
    { orgId: ORG, kind: 'task', clientEventId: 'ce-1' },
    f.deps,
  );
  assert.ok(first.ok && retry.ok);
  assert.equal(retry.session.id, first.session.id);
  assert.equal(retry.idempotent, true);
  assert.equal(f.rows.length, 1, 'a retried start does not create a second session');
});

test('ending the armed session releases the wedge', async () => {
  const f = fakes();
  const a = await startSession({ orgId: ORG, kind: 'scan', scanType: 'unbox', arm: true }, f.deps);
  assert.ok(a.ok);

  const ended = await endSession({ orgId: ORG, sessionId: a.session.id }, f.deps);
  assert.ok(ended.ok);
  assert.equal(ended.session.status, 'ended');
  assert.equal(ended.session.armed, false);
  assert.equal(await getArmedScanSession({ orgId: ORG }, f.deps), null);

  const again = await endSession({ orgId: ORG, sessionId: a.session.id }, f.deps);
  assert.ok(again.ok);
  assert.equal(again.idempotent, true, 'a retried end is a no-op, not a 409');
});

test('parking disarms; resuming does NOT re-arm', async () => {
  const f = fakes();
  const a = await startSession({ orgId: ORG, kind: 'scan', scanType: 'unbox', arm: true }, f.deps);
  assert.ok(a.ok);

  const parked = await parkSession({ orgId: ORG, sessionId: a.session.id }, f.deps);
  assert.ok(parked.ok);
  assert.equal(parked.session.status, 'parked');
  assert.equal(parked.session.armed, false);

  const resumed = await resumeSession({ orgId: ORG, sessionId: a.session.id, staffId: 7 }, f.deps);
  assert.ok(resumed.ok);
  assert.equal(resumed.session.status, 'open');
  assert.equal(resumed.session.armed, false, 'resume never silently steals the wedge');
  assert.equal(resumed.session.claimedByStaffId, 7);
});

test('a parked session cannot be armed, and an ended one cannot be resumed', async () => {
  const f = fakes();
  const a = await startSession({ orgId: ORG, kind: 'scan', scanType: 'pickup' }, f.deps);
  assert.ok(a.ok);
  await parkSession({ orgId: ORG, sessionId: a.session.id }, f.deps);

  const armed = await armScanSession({ orgId: ORG, sessionId: a.session.id }, f.deps);
  assert.equal(armed.ok, false);
  assert.equal(armed.ok === false && armed.error, 'CANNOT_ARM_PARKED_SESSION');

  await endSession({ orgId: ORG, sessionId: a.session.id }, f.deps);
  const resumed = await resumeSession({ orgId: ORG, sessionId: a.session.id }, f.deps);
  assert.equal(resumed.ok, false);
  assert.equal(resumed.ok === false && resumed.error, 'SESSION_ALREADY_ENDED');
});

test('a stale expectedVersion is a 409, and nothing is written', async () => {
  const f = fakes();
  const a = await startSession({ orgId: ORG, kind: 'scan', scanType: 'unbox' }, f.deps);
  assert.ok(a.ok);

  const r = await armScanSession(
    { orgId: ORG, sessionId: a.session.id, expectedVersion: a.session.version + 5 },
    f.deps,
  );
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.status, 409);
  assert.equal(r.ok === false && r.error, 'VERSION_CONFLICT');
  assert.equal(f.rows[0].armed, false);
});

test('an unknown session id is a 404', async () => {
  const f = fakes();
  const r = await armScanSession({ orgId: ORG, sessionId: 999 }, f.deps);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.status, 404);
});

// ── purpose catalog (L1) ────────────────────────────────────────────────────

test('create custom purpose + session in one call; same label reuses purpose_id', async () => {
  const f = fakes();

  const first = await beginSession(
    {
      orgId: ORG,
      title: 'Helped Jordan identify inventory',
      purposeLabel: 'Beat Amazon buy box',
      notes: 'Compare eBay vs Amazon, drop Amazon only',
    },
    f.deps,
  );
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.session.title, 'Helped Jordan identify inventory');
  assert.equal(first.purpose.label, 'Beat Amazon buy box');
  assert.equal(first.purpose.isSystem, false);
  assert.equal(first.session.purposeId, first.purpose.id);
  assert.equal(first.session.kind, 'task');
  assert.equal(first.session.scanType, null);
  assert.equal(first.session.armed, false);
  assert.equal(first.session.notes, 'Compare eBay vs Amazon, drop Amazon only');
  assert.equal(f.intervals.filter((i) => i.kind === 'active' && i.ended_at == null).length, 1);

  const second = await beginSession(
    { orgId: ORG, title: 'Helped Sam with inventory identification', purposeLabel: 'beat amazon buy box' },
    f.deps,
  );
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.purpose.id, first.purpose.id, 'lower(label) must not fork the bucket');
  assert.equal(second.session.purposeId, first.purpose.id);
  assert.notEqual(second.session.id, first.session.id);
  assert.equal(
    f.purposes.filter((p) => String(p.label).toLowerCase() === 'beat amazon buy box').length,
    1,
  );
});

test('a custom session is kind=task, scan_type NULL, and does not take the arm index', async () => {
  const f = fakes();
  const unbox = await startSession(
    { orgId: ORG, kind: 'scan', scanType: 'unbox', surfaceKey: 'unbox', arm: true },
    f.deps,
  );
  assert.ok(unbox.ok && unbox.session.armed);

  const custom = await beginSession(
    { orgId: ORG, title: 'Helped Sam with inventory identification', purposeLabel: 'Staff assist extra' },
    f.deps,
  );
  assert.ok(custom.ok);
  if (!custom.ok) return;
  assert.equal(custom.session.kind, 'task');
  assert.equal(custom.session.scanType, null);
  assert.equal(custom.session.armed, false);
  assert.equal(unbox.session.armed, true, 'custom start must not disarm the scan');
  const armedRows = f.rows.filter((r) => r.kind === 'scan' && r.armed === true);
  assert.equal(armedRows.length, 1);
  assert.equal(armedRows[0].id, unbox.session.id);
});

test('rename title does not change purpose_id or attribution session_type', async () => {
  const f = fakes();
  const started = await beginSession(
    { orgId: ORG, title: 'Helped Jordan', purposeLabel: 'Staff assist extra' },
    f.deps,
  );
  assert.ok(started.ok);
  if (!started.ok) return;
  const before = attributionOf(started.session);
  assert.equal(before.sessionType, 'task');

  const renamed = await renameSession(
    { orgId: ORG, sessionId: started.session.id, title: 'Goods-in help' },
    f.deps,
  );
  assert.ok(renamed.ok);
  if (!renamed.ok) return;
  assert.equal(renamed.session.title, 'Goods-in help');
  assert.equal(renamed.session.purposeId, started.session.purposeId);
  assert.equal(renamed.session.kind, 'task');
  assert.equal(renamed.session.scanType, null);
  assert.deepEqual(attributionOf(renamed.session), before);
});

test('park/resume duration on a catalog session excludes the parked interval', async () => {
  const f = fakes();
  const started = await beginSession(
    { orgId: ORG, title: 'Product triage — Amazon buy box', purposeLabel: 'Product triage' },
    f.deps,
  );
  assert.ok(started.ok);
  if (!started.ok) return;

  f.advance(10 * 60_000);
  await parkSession({ orgId: ORG, sessionId: started.session.id }, f.deps);
  f.advance(5 * 60_000);
  await resumeSession({ orgId: ORG, sessionId: started.session.id, staffId: 3 }, f.deps);
  f.advance(4 * 60_000);
  const ended = await endSession(
    {
      orgId: ORG,
      sessionId: started.session.id,
      wrapUp: 'Amazon $89 → $84 to recapture Buy Box; eBay left at $89',
      wrapUpSource: 'staff',
    },
    f.deps,
  );
  assert.ok(ended.ok);
  if (!ended.ok) return;
  assert.equal(ended.session.wrapUp, 'Amazon $89 → $84 to recapture Buy Box; eBay left at $89');

  const active = f.intervals.filter((i) => i.kind === 'active');
  const parked = f.intervals.filter((i) => i.kind === 'parked');
  assert.equal(parked.length, 1);
  assert.equal(active.length, 2);
  const span = (row: (typeof f.intervals)[number]) =>
    Date.parse(String(row.ended_at)) - Date.parse(String(row.started_at));
  const activeMs = active.reduce((n, i) => n + span(i), 0);
  const parkedMs = parked.reduce((n, i) => n + span(i), 0);
  assert.equal(activeMs, 14 * 60_000);
  assert.equal(parkedMs, 5 * 60_000);
});

test('system Unbox start via purpose is kind=scan, scan_type=unbox, armed exclusive', async () => {
  const f = fakes();
  const first = await beginSession({ orgId: ORG, purposeLabel: 'Unbox' }, f.deps);
  assert.ok(first.ok);
  if (!first.ok) return;
  assert.equal(first.purpose.isSystem, true);
  assert.equal(first.purpose.key, 'unbox');
  assert.equal(first.session.kind, 'scan');
  assert.equal(first.session.scanType, 'unbox');
  assert.equal(first.session.surfaceKey, 'unbox');
  assert.equal(first.session.armed, true);
  assert.equal(first.session.title, 'Unbox');

  const second = await beginSession({ orgId: ORG, purposeLabel: 'Unbox', title: 'Unbox pallet 12' }, f.deps);
  assert.ok(second.ok);
  if (!second.ok) return;
  assert.equal(second.session.kind, 'scan');
  assert.equal(second.session.scanType, 'unbox');
  assert.equal(second.session.armed, true);
  assert.equal(second.session.title, 'Unbox pallet 12');
  const armed = f.rows.filter((r) => r.kind === 'scan' && r.armed === true);
  assert.equal(armed.length, 1, 'the unique partial index still holds');
  assert.equal(armed[0].id, second.session.id);
});

test('one string is both title and a new purpose label', async () => {
  const f = fakes();
  const r = await beginSession({ orgId: ORG, title: 'Helped Sam with inventory identification' }, f.deps);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.session.title, 'Helped Sam with inventory identification');
  assert.equal(r.purpose.label, 'Helped Sam with inventory identification');
  assert.equal(r.session.kind, 'task');
});

