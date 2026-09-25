import test from 'node:test';
import assert from 'node:assert/strict';
import { PomodoroTarget } from './contract';
import { changePomodoro, PomodoroRefusal, readPomodoro, viewPomodoro, type PomodoroDeps, type TimerRow, type TimerTransaction } from './timer';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const task: PomodoroTarget = { kind: 'task', id: 17 };
const daily: PomodoroTarget = { kind: 'checklist', id: 28, date: '2026-09-25' };
const targetKey = (target: PomodoroTarget) => target.kind === 'task'
  ? `task:${target.id}` : `checklist:${target.id}:${target.date}`;

function fakes() {
  const rows = new Map<string, TimerRow>();
  const views = new Map<string, string>();
  const captured: Array<{ op: string; orgId: string; staffId: number }> = [];
  let now = new Date('2026-09-25T17:00:00.000Z');
  let state: 'open' | 'completed' | 'missing' = 'open';
  const key = (orgId: string, staffId: number, target: PomodoroTarget) => `${orgId}:${staffId}:${targetKey(target)}`;
  const deps: PomodoroDeps = {
    transaction: async (orgId, fn) => {
      const tx: TimerTransaction = {
        guardTarget: async (scopeOrgId, target) => {
          captured.push({ op: `guard:${targetKey(target)}`, orgId: scopeOrgId, staffId: 0 });
        },
        lockStaff: async (staffId) => {
          captured.push({ op: 'lock', orgId, staffId });
        },
        now: async () => now,
        targetState: async (scopeOrgId, staffId) => {
          captured.push({ op: 'target', orgId: scopeOrgId, staffId });
          return state;
        },
        timer: async (scopeOrgId, staffId, target) => rows.get(key(scopeOrgId, staffId, target)) ?? null,
        active: async (scopeOrgId, staffId) => [...rows.entries()]
          .find(([k, row]) => k.startsWith(`${scopeOrgId}:${staffId}:`) && row.startedAt !== null)?.[1] ?? null,
        insert: async (scopeOrgId, staffId, target, stamp) => {
          captured.push({ op: 'insert', orgId: scopeOrgId, staffId });
          rows.set(key(scopeOrgId, staffId, target), { target, accumulatedMs: 0, cycleOriginMs: 0, startedAt: stamp });
        },
        save: async (scopeOrgId, staffId, timer) => {
          captured.push({ op: 'save', orgId: scopeOrgId, staffId });
          rows.set(key(scopeOrgId, staffId, timer.target), timer);
        },
        recordView: async (scopeOrgId, staffId, target, clientEventId) => {
          const prior = views.get(`${scopeOrgId}:${staffId}:${clientEventId}`);
          if (prior) return prior === targetKey(target) ? 'duplicate' : 'conflict';
          views.set(`${scopeOrgId}:${staffId}:${clientEventId}`, targetKey(target));
          return 'inserted';
        },
      };
      return fn(tx);
    },
  };
  return {
    deps, captured, rows, views,
    advance: (milliseconds: number) => { now = new Date(now.getTime() + milliseconds); },
    setState: (value: typeof state) => { state = value; },
  };
}

test('elapsed work survives reads, repeated start and repeated pause without double count', async () => {
  const fake = fakes();
  const first = await changePomodoro(ORG, 7, task, 'start', fake.deps);
  assert.equal(first.changed, true);
  assert.equal(first.timer?.remainingSeconds, 1500);
  assert.deepEqual(fake.captured.slice(0, 4).map((x) => x.op), ['guard:task:17', 'lock', 'target', 'insert']);
  fake.advance(61_450);
  const read = await readPomodoro(ORG, 7, task, fake.deps);
  assert.equal(read.timer?.elapsedSeconds, 61);
  assert.equal(read.timer?.remainingSeconds, 1439);
  assert.equal((await changePomodoro(ORG, 7, task, 'start', fake.deps)).changed, false);
  const paused = await changePomodoro(ORG, 7, task, 'pause', fake.deps);
  assert.equal(paused.timer?.elapsedSeconds, 61);
  assert.equal(paused.timer?.running, false);
  assert.equal((await changePomodoro(ORG, 7, task, 'pause', fake.deps)).changed, false);
  fake.advance(60_000);
  assert.equal((await readPomodoro(ORG, 7, task, fake.deps)).timer?.elapsedSeconds, 61);
  await changePomodoro(ORG, 7, task, 'start', fake.deps);
  fake.advance(550);
  assert.equal((await changePomodoro(ORG, 7, task, 'pause', fake.deps)).timer?.elapsedSeconds, 62);
  assert.equal(fake.rows.get(`${ORG}:7:task:17`)?.accumulatedMs, 62_000);
  assert.ok(fake.captured.filter((x) => x.op === 'save').every((x) => x.orgId === ORG && x.staffId === 7));
});

test('starting another record pauses prior focus, per staff and tenant isolation holds', async () => {
  const fake = fakes();
  await changePomodoro(ORG, 7, task, 'start', fake.deps);
  fake.advance(30_000);
  const next = await changePomodoro(ORG, 7, daily, 'start', fake.deps);
  assert.deepEqual([next.timer?.kind, next.activeTimer?.id], ['checklist', 28]);
  assert.equal(fake.rows.get(`${ORG}:7:task:17`)?.accumulatedMs, 30_000);
  assert.equal(fake.rows.get(`${ORG}:7:task:17`)?.startedAt, null);
  await changePomodoro(OTHER, 7, task, 'start', fake.deps);
  await changePomodoro(ORG, 8, task, 'start', fake.deps);
  assert.equal((await readPomodoro(OTHER, 7, task, fake.deps)).timer?.elapsedSeconds, 0);
  assert.equal((await readPomodoro(ORG, 7, task, fake.deps)).activeTimer?.id, 28);
});

test('completed cycle requires explicit reset and keeps cumulative work while running', async () => {
  const fake = fakes();
  await changePomodoro(ORG, 7, task, 'start', fake.deps);
  await assert.rejects(() => changePomodoro(ORG, 7, task, 'reset_cycle', fake.deps),
    (error: unknown) => error instanceof PomodoroRefusal && error.reason === 'cycle_incomplete');
  fake.advance(1_501_000);
  assert.equal((await readPomodoro(ORG, 7, task, fake.deps)).timer?.remainingSeconds, 0);
  const reset = await changePomodoro(ORG, 7, task, 'reset_cycle', fake.deps);
  assert.deepEqual([reset.timer?.elapsedSeconds, reset.timer?.remainingSeconds, reset.timer?.running], [1501, 1500, true]);
  assert.equal(fake.rows.get(`${ORG}:7:task:17`)?.cycleOriginMs, 1_501_000);
  fake.advance(5_000);
  assert.equal((await readPomodoro(ORG, 7, task, fake.deps)).timer?.elapsedSeconds, 1506);
  assert.equal((await readPomodoro(ORG, 7, task, fake.deps)).timer?.remainingSeconds, 1495);
});

test('completed targets remain readable but cannot be restarted or steal active time', async () => {
  const fake = fakes();
  await changePomodoro(ORG, 7, daily, 'start', fake.deps);
  fake.setState('completed');
  assert.equal((await readPomodoro(ORG, 7, task, fake.deps)).activeTimer?.kind, 'checklist');
  await assert.rejects(() => changePomodoro(ORG, 7, task, 'start', fake.deps),
    (error: unknown) => error instanceof PomodoroRefusal && error.reason === 'completed');
  assert.equal((await readPomodoro(ORG, 7, daily, fake.deps)).activeTimer?.kind, 'checklist');
  fake.setState('missing');
  await assert.rejects(() => readPomodoro(ORG, 7, task, fake.deps),
    (error: unknown) => error instanceof PomodoroRefusal && error.reason === 'not_found');
});

test('explicit opening deduplicates retries, but UUID reuse for another record conflicts', async () => {
  const fake = fakes();
  const uuid = '33333333-3333-4333-8333-333333333333';
  assert.equal((await viewPomodoro(ORG, 7, task, uuid, fake.deps)).changed, true);
  assert.equal((await viewPomodoro(ORG, 7, task, uuid, fake.deps)).changed, false);
  assert.equal(fake.views.size, 1);
  await assert.rejects(() => viewPomodoro(ORG, 7, daily, uuid, fake.deps),
    (error: unknown) => error instanceof PomodoroRefusal && error.reason === 'event_conflict');
  assert.equal((await viewPomodoro(OTHER, 7, daily, uuid, fake.deps)).changed, true);
});
