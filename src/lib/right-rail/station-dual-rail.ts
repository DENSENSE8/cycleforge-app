'use client';

/**
 * Scan-station dual-rail coupling — Unbox · Arrival · Testing only.
 *
 * When the left context rail and right Displays are both open, a sash drag on
 * either side redistributes width inversely while the middle stays locked at
 * {@link STATION_WORKBENCH_LOCK_PX} (720):
 *
 *   left' + 720 + displays' = frame
 *
 * Desk RightRailHost inspectors are out of scope.
 *
 * Persistence stays on the existing keys ({@link CONTEXT_PANEL_RESIZE}.storageKey
 * + the per-surface Displays `storageKey`) — no third localStorage key.
 */

import { CONTEXT_PANEL_RESIZE } from '@/components/sidebar/context-panel-column';
import {
  STATION_COLUMN_BUDGET,
  STATION_DISPLAYS_MIN_WIDTH_PX,
  STATION_WORKBENCH_LOCK_PX,
} from '@/components/station/workbench/workbench-layout';
import {
  getContextRailCostOpenPx,
  getRailOperatorCollapsed,
  getRightRailFrameWidthPx,
  getStationPushActive,
  getStationPushDesiredWidthPx,
  resolveStationDisplaysCollapse,
  setRightRailContextRail,
  setStationPushDemand,
} from '@/lib/right-rail/frame';

type StationDualRailPrimary = 'context' | 'displays';

interface StationDualRailInput {
  frameWidthPx: number;
  leftPx: number;
  displaysPx: number;
  /** Signed change applied to {@link primary} (positive grows that column). */
  deltaPx: number;
  primary: StationDualRailPrimary;
  leftMinPx?: number;
  displaysMinPx?: number;
  middleLockPx?: number;
}

interface StationDualRailResult {
  leftPx: number;
  displaysPx: number;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Pure inverse-delta math with a hard middle lock.
 *
 * Applies Δ to the primary column and re-pins so
 * `left + middleLock + displays === frame` (within peer mins). It expresses the
 * drag as the operator's intended LEFT — a displays-primary drag is its inverse,
 * because the middle is locked — and hands it to {@link resolveStationYieldLadder}.
 * ONE distributor serves both the coupling and the invariant sweep, so the drag
 * cannot disagree with the proved budget.
 */
export function resolveStationDualRailDelta(
  input: StationDualRailInput,
): StationDualRailResult {
  const leftMin = input.leftMinPx ?? CONTEXT_PANEL_RESIZE.minWidthPx;
  const displaysMin = input.displaysMinPx ?? STATION_DISPLAYS_MIN_WIDTH_PX;
  const middleLock = input.middleLockPx ?? STATION_WORKBENCH_LOCK_PX;
  const frame = Number.isFinite(input.frameWidthPx)
    ? Math.max(0, input.frameWidthPx)
    : 0;

  if (frame <= 0) {
    return { leftPx: leftMin, displaysPx: displaysMin };
  }

  const delta = Number.isFinite(input.deltaPx) ? input.deltaPx : 0;
  // Zero delta re-pins without changing intent (keep left, displays = residual).
  const leftPreferredPx =
    delta === 0
      ? input.leftPx
      : input.primary === 'displays'
        ? frame - middleLock - (input.displaysPx + delta)
        : input.leftPx + delta;

  const r = resolveStationYieldLadder({
    frameWidthPx: frame,
    leftPreferredPx,
    // The coupling runs only while Displays is an OPEN in-flow column (a parked
    // or collapsed rail turns coupling off), so this resolves the OPEN,
    // exact-fill arm of the ladder.
    wasDisplaysCollapsed: false,
    minLeftPx: leftMin,
    leftHardMinPx: leftMin,
    displaysHardMinPx: displaysMin,
    middleLockPx: middleLock,
  });
  return { leftPx: r.leftPx, displaysPx: r.displaysPx };
}

// ── The yield ladder (the provable frame budget) ────────────────────────────

interface StationYieldLadderInput {
  /** Content-row width (context rail + locked middle + Displays). */
  frameWidthPx: number;
  /** Operator's context-rail width preference (where they dragged the sash). */
  leftPreferredPx: number;
  /** Prior collapse state — the hysteresis latch. */
  wasDisplaysCollapsed: boolean;
  /** Left cost the rail rests at when it can yield no further (300 open · strip parked · 0 none). */
  minLeftPx?: number;
  /** Context hardMin wall. */
  leftHardMinPx?: number;
  /** Displays hardMin wall. */
  displaysHardMinPx?: number;
  /** The locked middle. */
  middleLockPx?: number;
}

interface StationYieldLadderResult {
  leftPx: number;
  middlePx: number;
  displaysPx: number;
  displaysState: 'OPEN' | 'CLOSED';
}

/**
 * The pure distributor. Given a frame and the operator's preferences, resolve
 * the three column widths by the {@link STATION_COLUMN_BUDGET} yield ladder,
 * never violating a hardMin wall (Fiori / M3 collapse hierarchy). Every worked
 * number in the invariant sweep comes from here — provable before a browser
 * opens.
 *
 * Invariants held (see `station-yield-ladder.guard.test.ts`):
 *  - I2 `middlePx >= middleLock` — the 720 lock is `shrinkPriority: 0`, never crushed.
 *  - I3 `displaysPx >= displaysHardMin || displaysState === 'CLOSED'`.
 *  - I4 `leftPx + middlePx + displaysPx <= frame`.
 *  - I5 (OPEN) `leftPx + middleLock + displaysPx === frame` — exact fill.
 *  - I6 a shrinkable pane never computes `< hardMin`; if it would, it CLOSES.
 *  - I1 `leftPx >= leftHardMin` (context never closes here — it yields toward its wall).
 */
export function resolveStationYieldLadder(
  input: StationYieldLadderInput,
): StationYieldLadderResult {
  const leftHardMin = input.leftHardMinPx ?? STATION_COLUMN_BUDGET.context.hardMinPx;
  const displaysMin = input.displaysHardMinPx ?? STATION_COLUMN_BUDGET.displays.hardMinPx;
  const middleLock = input.middleLockPx ?? STATION_COLUMN_BUDGET.primary.hardMinPx;
  const minLeft = input.minLeftPx ?? leftHardMin;
  const frame = Number.isFinite(input.frameWidthPx) ? Math.max(0, input.frameWidthPx) : 0;

  const collapsed = resolveStationDisplaysCollapse({
    frameWidthPx: frame,
    minLeftPx: minLeft,
    wasCollapsed: input.wasDisplaysCollapsed,
  });

  if (frame <= 0) {
    // Unmeasured — echo prefs at the walls; do not decide geometry.
    return {
      leftPx: Math.max(leftHardMin, input.leftPreferredPx),
      middlePx: middleLock,
      displaysPx: collapsed ? 0 : displaysMin,
      displaysState: collapsed ? 'CLOSED' : 'OPEN',
    };
  }

  if (collapsed) {
    // Displays floats (out of flow); the center FILLS the leftover (flex-1).
    const left = clamp(
      input.leftPreferredPx,
      leftHardMin,
      Math.max(leftHardMin, frame - middleLock),
    );
    return {
      leftPx: left,
      middlePx: Math.max(middleLock, frame - left),
      displaysPx: 0,
      displaysState: 'CLOSED',
    };
  }

  // OPEN — exact fill: left + middleLock + displays = frame.
  // Displays yields FIRST (it is the leftover-filler), so it absorbs the frame
  // change while the operator's left is preserved; context yields SECOND, only
  // when displays would otherwise drop below its hardMin. OPEN ⟹ frame ≥ the
  // close threshold ⟹ displays ≥ its hardMin (I6 keeps the close edge hard).
  const leftCeilForDisplaysMin = frame - middleLock - displaysMin;
  const left = clamp(
    input.leftPreferredPx,
    leftHardMin,
    Math.max(leftHardMin, leftCeilForDisplaysMin),
  );
  return {
    leftPx: left,
    middlePx: middleLock,
    displaysPx: frame - middleLock - left,
    displaysState: 'OPEN',
  };
}

/**
 * The widest Displays the ladder allows at this frame — context yielded to its
 * hardMin (its 720 softMax is advisory, never a wall). Feeds the Displays sash
 * `maxWidth` while coupling so the sash traverses the whole valid range without
 * the coupling clamping it back (the source of the old edge jitter).
 */
export function stationLadderMaxDisplaysPx(
  frameWidthPx: number,
  leftHardMinPx = STATION_COLUMN_BUDGET.context.hardMinPx,
  middleLockPx = STATION_COLUMN_BUDGET.primary.hardMinPx,
  displaysMinPx = STATION_COLUMN_BUDGET.displays.hardMinPx,
): number {
  const frame = Number.isFinite(frameWidthPx) ? Math.max(0, frameWidthPx) : 0;
  return Math.max(displaysMinPx, frame - middleLockPx - leftHardMinPx);
}

/**
 * The widest context rail the ladder allows at this frame — Displays yielded to
 * its hardMin. Feeds the context sash `maxWidth` while coupling.
 */
export function stationLadderMaxContextPx(
  frameWidthPx: number,
  leftHardMinPx = STATION_COLUMN_BUDGET.context.hardMinPx,
  middleLockPx = STATION_COLUMN_BUDGET.primary.hardMinPx,
  displaysMinPx = STATION_COLUMN_BUDGET.displays.hardMinPx,
): number {
  const frame = Number.isFinite(frameWidthPx) ? Math.max(0, frameWidthPx) : 0;
  return Math.max(leftHardMinPx, frame - middleLockPx - displaysMinPx);
}

// ── Coupling bus (writers notify the peer rail to setWidth) ─────────────────

type StationCoupledSource = StationDualRailPrimary;

interface StationCoupledSnapshot {
  leftPx: number;
  displaysPx: number;
  source: StationCoupledSource;
  epoch: number;
}

type Listener = () => void;

const listeners = new Set<Listener>();
let snapshot: StationCoupledSnapshot | null = null;
let displaysStorageKey: string | null = null;

const SERVER_SNAPSHOT: StationCoupledSnapshot | null = null;

function persistWidth(key: string, value: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, String(Math.round(value)));
  } catch {
    /* private mode / quota */
  }
}

function publish(next: StationCoupledSnapshot): void {
  snapshot = next;
  listeners.forEach((l) => l());
}

export function subscribeStationCoupled(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStationCoupled(): StationCoupledSnapshot | null {
  return snapshot;
}

export function getServerStationCoupled(): StationCoupledSnapshot | null {
  return SERVER_SNAPSHOT;
}

/**
 * Displays column registers its per-surface storage key while mounted so a
 * context-rail sash can persist the inverse Displays preference.
 */
export function registerStationDisplaysStorageKey(storageKey: string): () => void {
  displaysStorageKey = storageKey;
  return () => {
    if (displaysStorageKey === storageKey) displaysStorageKey = null;
  };
}

/**
 * Coupling is live only while station Displays push is active and the context
 * rail is open (not operator-collapsed).
 */
export function isStationDualRailCouplingActive(): boolean {
  if (!getStationPushActive()) return false;
  if (getRailOperatorCollapsed()) return false;
  if (getContextRailCostOpenPx() <= 0) return false;
  if (getRightRailFrameWidthPx() <= 0) return false;
  return true;
}

/**
 * Displays sash moved by `deltaPx` (positive = Displays wider). Updates the
 * context-rail preference inversely and notifies ContextPanelLayout.
 */
export function applyStationDisplaysDelta(
  deltaPx: number,
  live?: { leftPx: number; displaysPx: number },
): StationDualRailResult | null {
  if (!isStationDualRailCouplingActive()) return null;

  const leftPx = live?.leftPx ?? getContextRailCostOpenPx();
  const displaysPx = live?.displaysPx ?? getStationPushDesiredWidthPx();
  const next = resolveStationDualRailDelta({
    frameWidthPx: getRightRailFrameWidthPx(),
    leftPx,
    displaysPx,
    deltaPx,
    primary: 'displays',
  });

  if (next.leftPx === leftPx && next.displaysPx === displaysPx) {
    return next;
  }

  persistWidth(CONTEXT_PANEL_RESIZE.storageKey, next.leftPx);
  setRightRailContextRail({
    railCostOpenPx: next.leftPx,
    railOperatorCollapsed: false,
  });
  setStationPushDemand({ active: true, desiredWidthPx: next.displaysPx });

  publish({
    leftPx: next.leftPx,
    displaysPx: next.displaysPx,
    source: 'displays',
    epoch: (snapshot?.epoch ?? 0) + 1,
  });

  return next;
}

/**
 * Context-rail sash moved by `deltaPx` (positive = context wider). Updates the
 * Displays preference inversely and notifies UnboxPushColumn.
 */
export function applyStationContextDelta(
  deltaPx: number,
  live?: { leftPx: number; displaysPx: number },
): StationDualRailResult | null {
  if (!isStationDualRailCouplingActive()) return null;

  const leftPx = live?.leftPx ?? getContextRailCostOpenPx();
  const displaysPx = live?.displaysPx ?? getStationPushDesiredWidthPx();
  const next = resolveStationDualRailDelta({
    frameWidthPx: getRightRailFrameWidthPx(),
    leftPx,
    displaysPx,
    deltaPx,
    primary: 'context',
  });

  if (next.leftPx === leftPx && next.displaysPx === displaysPx) {
    return next;
  }

  persistWidth(CONTEXT_PANEL_RESIZE.storageKey, next.leftPx);
  if (displaysStorageKey) persistWidth(displaysStorageKey, next.displaysPx);

  setRightRailContextRail({
    railCostOpenPx: next.leftPx,
    railOperatorCollapsed: false,
  });
  setStationPushDemand({ active: true, desiredWidthPx: next.displaysPx });

  publish({
    leftPx: next.leftPx,
    displaysPx: next.displaysPx,
    source: 'context',
    epoch: (snapshot?.epoch ?? 0) + 1,
  });

  return next;
}
