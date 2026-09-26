/**
 * The order-import RUN LEDGER — a measured, step-by-step fold of the sync stream into something an operator can read while it runs.
 * Operator 2026-09-15: "I need a step-by-step measured what's syncing to build
 */
import type { SyncPhase, SyncStreamEvent } from './types';

/**
 * One stream of the import. Each posts its own request: ShipStation first, the
 * exceptions pass after it, against the rows it just landed.
 */
export type SyncRunLane = 'shipstation' | 'exceptions';

export type SyncRunStepId =
  | 'read_shipstation'
  | 'resolve_tracking'
  | 'update'
  | 'insert'
  | 'publish'
  | 'exceptions';

export type SyncRunStepState = 'pending' | 'running' | 'done' | 'skipped' | 'error';

export interface SyncRunStep {
  id: SyncRunStepId;
  /** Operator-facing sentence, present tense while running. */
  label: string;
  /** What the count counts, singular. */
  unit: string;
  state: SyncRunStepState;
  /** Accumulated across every lane and every emission. `undefined` = not yet known. */
  count?: number;
  error?: string;
}

/**
 * Declaration order IS paint order, and it mirrors the machine: the connector
 * reads, resolves tracking, applies updates, then inserts, then publishes.
 * Exceptions run last, after the rows they match against exist.
 */
const STEP_ORDER: readonly SyncRunStepId[] = [
  'read_shipstation',
  'resolve_tracking',
  'update',
  'insert',
  'publish',
  'exceptions',
] as const;

const STEP_META: Record<
  SyncRunStepId,
  { label: string; unit: string; measured: boolean }
> = {
  read_shipstation: { label: 'Read ShipStation orders', unit: 'order', measured: true },
  resolve_tracking: {
    label: 'Resolve tracking numbers',
    unit: 'tracking number',
    measured: true,
  },
  update: { label: 'Update changed orders', unit: 'order', measured: true },
  insert: { label: 'Insert new orders', unit: 'order', measured: true },
  // The emitters carry no count for publishing: it is a fan-out. A check mark
  // is the whole report.
  publish: { label: 'Publish to the desk', unit: '', measured: false },
  exceptions: { label: 'Resolve open exceptions', unit: 'exception', measured: true },
};

/** Which steps a lane can ever reach. Drives skipped-vs-empty. */
const LANE_STEPS: Record<SyncRunLane, readonly SyncRunStepId[]> = {
  shipstation: ['read_shipstation', 'resolve_tracking', 'update', 'insert', 'publish'],
  exceptions: ['exceptions'],
};

const PHASE_STEP: Partial<Record<SyncPhase, SyncRunStepId>> = {
  fetching_shipstation: 'read_shipstation',
  resolving_tracking: 'resolve_tracking',
  updating: 'update',
  inserting: 'insert',
  publishing: 'publish',
  scanning_exceptions: 'exceptions',
};

type SyncRunLaneStatus = 'idle' | 'running' | 'done' | 'error' | 'skipped';

interface LaneState {
  status: SyncRunLaneStatus;
  /** Furthest step this lane has reached, as an index into {@link STEP_ORDER}. */
  cursor: number;
  /** The step this lane is on right now. */
  current: SyncRunStepId | null;
  /** The step that was IN FLIGHT when this lane failed or was cancelled. */
  failedAt?: SyncRunStepId | null;
  error?: string;
}

export interface SyncRunState {
  lanes: Record<SyncRunLane, LaneState>;
  /** Accumulated per-step counts. Never overwritten downward. */
  counts: Partial<Record<SyncRunStepId, number>>;
  startedAt: number;
  endedAt?: number;
  /** True once no lane is still running and at least one lane has reported. */
  settled: boolean;
  cancelled: boolean;
}

const IDLE_LANE: LaneState = { status: 'idle', cursor: -1, current: null };

export function createSyncRun(
  lanes: readonly SyncRunLane[] = ['shipstation', 'exceptions'],
  startedAt: number = Date.now(),
): SyncRunState {
  const all = Object.keys(LANE_STEPS) as SyncRunLane[];
  const laneMap = {} as Record<SyncRunLane, LaneState>;
  for (const lane of all) {
    laneMap[lane] = lanes.includes(lane) ? { ...IDLE_LANE } : { ...IDLE_LANE, status: 'skipped' };
  }
  return { lanes: laneMap, counts: {}, startedAt, settled: false, cancelled: false };
}

/**
 * Advance one lane onto a step. The cursor is monotonic — a late repeat of an
 * earlier phase must never drag a step that already finished back to running.
 */
function advance(lane: LaneState, id: SyncRunStepId): LaneState {
  const next = STEP_ORDER.indexOf(id);
  return {
    ...lane,
    status: 'running',
    cursor: Math.max(lane.cursor, next),
    current: next >= lane.cursor ? id : lane.current,
  };
}

/** Fold one streamed event into the run. Returns a new state. */
export function applySyncRunEvent(
  state: SyncRunState,
  lane: SyncRunLane,
  event: SyncStreamEvent,
): SyncRunState {
  const current = state.lanes[lane];
  if (current.status === 'skipped') return state;

  if (event.type === 'phase') {
    if (event.phase === 'done') return completeSyncRunLane(state, lane, { ok: true });
    const id = PHASE_STEP[event.phase];
    if (!id) {
      // `starting` — the lane is alive but has no measurable step yet.
      return {
        ...state,
        lanes: { ...state.lanes, [lane]: { ...current, status: 'running' } },
      };
    }
    const counts =
      typeof event.count === 'number'
        ? { ...state.counts, [id]: (state.counts[id] ?? 0) + event.count }
        : state.counts;
    return { ...state, counts, lanes: { ...state.lanes, [lane]: advance(current, id) } };
  }

  if (event.type === 'exception') {
    // The exceptions pass reports rows, not phase counts — scanned is the measurable total, resolved is the win, and both are derivable from…
    const id: SyncRunStepId = 'exceptions';
    return {
      ...state,
      counts: { ...state.counts, [id]: (state.counts[id] ?? 0) + 1 },
      lanes: { ...state.lanes, [lane]: advance(current, id) },
    };
  }

  if (event.type === 'error') {
    return completeSyncRunLane(state, lane, { ok: false, error: event.error });
  }

  return state;
}

/** Terminal transition for one lane (its `result` landed, or it threw). */
export function completeSyncRunLane(
  state: SyncRunState,
  lane: SyncRunLane,
  outcome: { ok: boolean; error?: string },
): SyncRunState {
  const current = state.lanes[lane];
  if (current.status === 'skipped') return state;
  const lanes: Record<SyncRunLane, LaneState> = {
    ...state.lanes,
    [lane]: {
      ...current,
      status: outcome.ok ? 'done' : 'error',
      cursor: outcome.ok ? STEP_ORDER.length : current.cursor,
      current: null,
      failedAt: outcome.ok ? null : (current.current ?? STEP_ORDER[Math.max(current.cursor, 0)]),
      error: outcome.ok ? undefined : outcome.error,
    },
  };
  return withSettlement({ ...state, lanes });
}

/** Operator cancel. */
export function cancelSyncRun(state: SyncRunState): SyncRunState {
  const lanes = { ...state.lanes };
  for (const key of Object.keys(lanes) as SyncRunLane[]) {
    const lane = lanes[key];
    if (lane.status === 'running' || lane.status === 'idle') {
      lanes[key] = {
        ...lane,
        status: 'error',
        current: null,
        failedAt: lane.current,
        error: 'Cancelled',
      };
    }
  }
  return withSettlement({ ...state, lanes, cancelled: true });
}

function withSettlement(state: SyncRunState): SyncRunState {
  const lanes = Object.values(state.lanes);
  const anyRunning = lanes.some((l) => l.status === 'running' || l.status === 'idle');
  const anyReported = lanes.some((l) => l.status === 'done' || l.status === 'error');
  const settled = !anyRunning && anyReported;
  if (settled === state.settled) return state;
  return { ...state, settled, endedAt: settled ? Date.now() : undefined };
}

/** Which lanes own a step, ignoring lanes that never ran. */
function owningLanes(state: SyncRunState, id: SyncRunStepId): LaneState[] {
  return (Object.keys(LANE_STEPS) as SyncRunLane[])
    .filter((lane) => LANE_STEPS[lane].includes(id))
    .map((lane) => state.lanes[lane])
    .filter((lane) => lane.status !== 'skipped');
}

function stepState(state: SyncRunState, id: SyncRunStepId): { state: SyncRunStepState; error?: string } {
  const owners = owningLanes(state, id);
  if (owners.length === 0) return { state: 'skipped' };
  if (owners.some((lane) => lane.current === id && lane.status === 'running')) {
    return { state: 'running' };
  }
  const index = STEP_ORDER.indexOf(id);
  // A failure is pinned to ONE step (`failedAt`). Steps the lane had already
  // passed stay done — they really did happen.
  const failed = owners.find((lane) => lane.failedAt === id);
  if (failed) return { state: 'error', error: failed.error };
  const reached = owners.some((lane) => lane.cursor >= index || lane.status === 'done');
  if (!reached) return { state: 'pending' };
  const stillComing = owners.some(
    (lane) => (lane.status === 'running' || lane.status === 'idle') && lane.cursor < index,
  );
  if (stillComing) return { state: 'running' };
  return { state: 'done' };
}

/** The renderable ledger. */
export function syncRunSteps(state: SyncRunState): SyncRunStep[] {
  return STEP_ORDER.map((id) => {
    const resolved = stepState(state, id);
    const meta = STEP_META[id];
    const raw = state.counts[id];
    const count = meta.measured ? (raw ?? (resolved.state === 'done' ? 0 : undefined)) : undefined;
    return {
      id,
      label: meta.label,
      unit: meta.unit,
      state: resolved.state,
      count,
      error: resolved.error,
    };
  });
}

/**
 * The one-sentence roll-up a settled run reports ("Orders synced: 35
 * inserted, 9 updated"). Named here because three surfaces consume it — the
 * run view, the hook's own `status`, and the demo driver.
 */
export interface SyncRunOutcomeLine {
  type: 'success' | 'error';
  message: string;
}

interface SyncRunProgress {
  /** Finished (or failed) required steps — PG6's numerator. */
  completed: number;
  /** Required steps only; a skipped lane's steps are not on the board. */
  total: number;
  /** The step to name in a one-line face ("Inserting new orders"). */
  currentLabel: string | null;
}

export function syncRunProgress(state: SyncRunState): SyncRunProgress {
  const steps = syncRunSteps(state).filter((step) => step.state !== 'skipped');
  const completed = steps.filter((step) => step.state === 'done' || step.state === 'error').length;
  const running = steps.find((step) => step.state === 'running');
  return {
    completed,
    total: steps.length,
    currentLabel: running?.label ?? null,
  };
}

/** Rows the run looked at — the "how many is it importing" headline number. */
export function syncRunRowsSeen(state: SyncRunState): number {
  return state.counts.read_shipstation ?? 0;
}
