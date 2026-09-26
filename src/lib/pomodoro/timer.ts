import {
  FOCUS_CYCLE_MS,
  FOCUS_CYCLE_SECONDS,
  type PomodoroAction,
  type PomodoroResponse,
  type PomodoroTarget,
  type PomodoroTimer,
} from './contract';

export interface TimerRow {
  target: PomodoroTarget;
  accumulatedMs: number;
  cycleOriginMs: number;
  startedAt: Date | null;
}

export interface TimerTransaction {
  /** Lock task parent before staff lock; completion triggers take locks in this order. */
  guardTarget(orgId: string, target: PomodoroTarget): Promise<void>;
  lockStaff(staffId: number): Promise<void>;
  now(): Promise<Date>;
  targetState(orgId: string, staffId: number, target: PomodoroTarget): Promise<'open' | 'completed' | 'missing'>;
  timer(orgId: string, staffId: number, target: PomodoroTarget): Promise<TimerRow | null>;
  active(orgId: string, staffId: number): Promise<TimerRow | null>;
  insert(orgId: string, staffId: number, target: PomodoroTarget, now: Date): Promise<void>;
  save(orgId: string, staffId: number, timer: TimerRow): Promise<void>;
  recordView(orgId: string, staffId: number, target: PomodoroTarget, clientEventId: string, now: Date): Promise<'inserted' | 'duplicate' | 'conflict'>;
}

export interface PomodoroDeps {
  transaction<T>(orgId: string, fn: (tx: TimerTransaction) => Promise<T>): Promise<T>;
}

export class PomodoroRefusal extends Error {
  constructor(public readonly reason: 'not_found' | 'completed' | 'cycle_incomplete' | 'event_conflict') {
    super(reason);
  }
}

function runningMilliseconds(row: TimerRow, now: Date): number {
  return row.startedAt ? Math.max(0, now.getTime() - row.startedAt.getTime()) : 0;
}

function timerFace(row: TimerRow, now: Date): PomodoroTimer {
  const total = row.accumulatedMs + runningMilliseconds(row, now);
  const cycle = Math.max(0, total - row.cycleOriginMs);
  return {
    kind: row.target.kind,
    id: row.target.id,
    date: row.target.kind === 'checklist' ? row.target.date : null,
    running: row.startedAt !== null,
    elapsedSeconds: Math.floor(total / 1000),
    cycleElapsedSeconds: Math.floor(cycle / 1000),
    remainingSeconds: Math.max(0, Math.ceil((FOCUS_CYCLE_MS - cycle) / 1000)),
    cycleSeconds: FOCUS_CYCLE_SECONDS,
    startedAt: row.startedAt?.toISOString() ?? null,
    serverNow: now.toISOString(),
  };
}

function response(target: TimerRow | null, active: TimerRow | null, now: Date, changed?: boolean): PomodoroResponse {
  return {
    ok: true,
    timer: target ? timerFace(target, now) : null,
    activeTimer: active ? timerFace(active, now) : null,
    serverNow: now.toISOString(),
    ...(changed === undefined ? {} : { changed }),
  };
}

/** Reads one viewer's own record; no clock source or identity comes from the browser. */
export async function readPomodoro(
  orgId: string,
  staffId: number,
  target: PomodoroTarget,
  deps: PomodoroDeps,
): Promise<PomodoroResponse> {
  return deps.transaction(orgId, async (tx) => {
    const state = await tx.targetState(orgId, staffId, target);
    if (state === 'missing') throw new PomodoroRefusal('not_found');
    const now = await tx.now();
    const [timer, active] = await Promise.all([
      tx.timer(orgId, staffId, target),
      tx.active(orgId, staffId),
    ]);
    return response(timer, active, now);
  });
}

/** An opening is explicit, with one UUID reused across retries, never a GET/poll side effect. */
export async function viewPomodoro(
  orgId: string,
  staffId: number,
  target: PomodoroTarget,
  clientEventId: string,
  deps: PomodoroDeps,
): Promise<PomodoroResponse> {
  return deps.transaction(orgId, async (tx) => {
    const state = await tx.targetState(orgId, staffId, target);
    if (state === 'missing') throw new PomodoroRefusal('not_found');
    const now = await tx.now();
    const record = await tx.recordView(orgId, staffId, target, clientEventId, now);
    if (record === 'conflict') throw new PomodoroRefusal('event_conflict');
    const [timer, active] = await Promise.all([
      tx.timer(orgId, staffId, target),
      tx.active(orgId, staffId),
    ]);
    return response(timer, active, now, record === 'inserted');
  });
}

/** One advisory lock serializes this staffer's devices and checklist/task transitions. */
export async function changePomodoro(
  orgId: string,
  staffId: number,
  target: PomodoroTarget,
  action: PomodoroAction,
  deps: PomodoroDeps,
): Promise<PomodoroResponse> {
  return deps.transaction(orgId, async (tx) => {
    await tx.guardTarget(orgId, target);
    await tx.lockStaff(staffId);
    const now = await tx.now();
    const state = await tx.targetState(orgId, staffId, target);
    if (state === 'missing') throw new PomodoroRefusal('not_found');
    if (action === 'start' && state === 'completed') throw new PomodoroRefusal('completed');

    let timer = await tx.timer(orgId, staffId, target);
    let active = await tx.active(orgId, staffId);
    let changed = false;

    if (action === 'start' && !timer?.startedAt) {
      if (active) {
        const paused = { ...active, accumulatedMs: active.accumulatedMs + runningMilliseconds(active, now), startedAt: null };
        await tx.save(orgId, staffId, paused);
        active = null;
      }
      if (timer) {
        timer = { ...timer, startedAt: now };
        await tx.save(orgId, staffId, timer);
      } else {
        await tx.insert(orgId, staffId, target, now);
        timer = { target, accumulatedMs: 0, cycleOriginMs: 0, startedAt: now };
      }
      active = timer;
      changed = true;
    } else if (action === 'pause' && timer?.startedAt) {
      timer = { ...timer, accumulatedMs: timer.accumulatedMs + runningMilliseconds(timer, now), startedAt: null };
      await tx.save(orgId, staffId, timer);
      active = null;
      changed = true;
    } else if (action === 'reset_cycle' && timer) {
      const total = timer.accumulatedMs + runningMilliseconds(timer, now);
      if (total - timer.cycleOriginMs < FOCUS_CYCLE_MS) throw new PomodoroRefusal('cycle_incomplete');
      timer = { ...timer, accumulatedMs: total, cycleOriginMs: total, startedAt: timer.startedAt ? now : null };
      await tx.save(orgId, staffId, timer);
      if (active) active = timer;
      changed = true;
    } else if (action === 'reset_cycle') {
      throw new PomodoroRefusal('cycle_incomplete');
    }

    return response(timer, active, now, changed);
  });
}
