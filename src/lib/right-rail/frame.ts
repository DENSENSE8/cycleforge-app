'use client';

/** Right-rail FRAME store + the push/overlay decision. */

import {
  CONTEXT_PANEL_COLLAPSE,
  CONTEXT_PANEL_RESIZE,
  CONTEXT_PANEL_WIDTH_PX,
} from '@/components/sidebar/context-panel-column';
import {
  STATION_DISPLAYS_AUTO_CLOSE_FRAME_PX,
  STATION_DISPLAYS_AUTO_CLOSE_HYSTERESIS_PX,
  STATION_DISPLAYS_MIN_WIDTH_PX,
  STATION_WORKBENCH_LOCK_PX,
} from '@/components/station/workbench/workbench-layout';
import { DETAIL_STACK_RESIZE } from '@/design-system/shells/detail-stack';

/** Flush planes — no outer gutter island between rail / center / push (2026-08-03). */
export const RIGHT_RAIL_GUTTER_PX = 0;

/** What an operator-collapsed context rail still costs: the slim strip only. */
export const CONTEXT_RAIL_PARKED_PX = CONTEXT_PANEL_COLLAPSE.stripWidthPx;

/**
 * Station Displays push — reserve the scan middle lock so Displays / context
 * cannot crush the workbench below {@link STATION_WORKBENCH_LOCK_PX}. Desk
 * inspectors keep {@link MIN_WORK_SURFACE_PX}.
 */
export const STATION_PUSH_CENTER_FLOOR_PX = STATION_WORKBENCH_LOCK_PX;

/** The work surface's floor for **desk** inspectors (dashboard / History peek). */
export const MIN_WORK_SURFACE_PX = 784;

interface RightRailFrameInput {
  /** Width of the content ROW (invariant under push — see the docblock). */
  frameWidthPx: number;
  /** The route rail's cost WHEN OPEN (card + margins). 0 when the route has none. */
  railCostOpenPx: number;
  /** True when the OPERATOR collapsed the rail — their choice, not a mask. */
  railOperatorCollapsed: boolean;
  /** False for occupants that must not push (station edge, assistant, modal). */
  wantsPush: boolean;
  /**
   * Px the center must keep while computing the right-panel cap.
   * Desk inspectors: {@link MIN_WORK_SURFACE_PX}. Station Displays push:
   * {@link STATION_PUSH_CENTER_FLOOR_PX} (720 — middle lock).
   */
  centerFloorPx: number;
}

interface RightRailFrameResolution {
  mode: 'push' | 'overlay';
  /** Ceiling for the panel's drag-resize while pushing (center floor kept). */
  capPx: number;
  /**
   * Fullscreen maximize width — frame minus the left rail, **no** center floor.
   * The work surface yields so an intake form can be read; restore returns to
   * {@link capPx}. Still in-flow push, not a floating overlay.
   */
  coverPx: number;
}

/**
 * The store's published snapshot — the pure frame resolution PLUS the reactive
 * Displays-collapse flag (hysteresis needs prior state, so it lives in the
 * store, not in the pure {@link resolveRightRailFrame}).
 */
interface RightRailFrameSnapshot extends RightRailFrameResolution {
  /** Station Displays has auto-parked to the slim right-edge strip at this frame width ({@link resolveStationDisplaysCollapse}). */
  stationDisplaysCollapsed: boolean;
  /** Local clamp for the station **Displays** sash — the widest Displays may reach beside the live left-rail cost and the 720 center floor… */
  stationDisplaysCapPx: number;
  /** Local clamp for the station **context** sash — the widest the rail may reach beside the current Displays width and the 720 center floor… */
  stationContextCapPx: number;
  /** The **Displays** sash is armed to park the CONTEXT rail — the operator is dragging Displays past its cap (the rail already pinned at its… */
  stationDisplaysSashArmed: boolean;
  /**
   * The **context** sash is armed to close DISPLAYS — the reverse cascade. Relayed
   * so `StationDisplaysPushColumn` lights its own seam warning. One writer:
   * {@link setStationContextSashArmed}.
   */
  stationContextSashArmed: boolean;
}

/**
 * Left cost the frame must reserve: open card, operator strip, or nothing.
 * Never an ephemeral push-park — the right edge does not close the left rail.
 */
function restingLeftPx(input: Pick<RightRailFrameInput, 'railCostOpenPx' | 'railOperatorCollapsed'>): number {
  if (input.railCostOpenPx <= 0) return 0;
  return input.railOperatorCollapsed ? CONTEXT_RAIL_PARKED_PX : input.railCostOpenPx;
}

/**
 * Pure. Every worked number in the unit test comes from here, so the budget is
 * provable without mounting anything.
 */
export function resolveRightRailFrame(input: RightRailFrameInput): RightRailFrameResolution {
  const { frameWidthPx, wantsPush, centerFloorPx } = input;
  const leftPx = restingLeftPx(input);
  const floor = Number.isFinite(centerFloorPx) && centerFloorPx > 0 ? centerFloorPx : 0;

  // Cap against the ACTUAL left cost so the operator can keep the context rail
  // open while the right panel grows. Station push passes
  // STATION_PUSH_CENTER_FLOOR_PX (720); desk inspectors pass MIN_WORK_SURFACE_PX.
  const capPx = Math.max(
    DETAIL_STACK_RESIZE.minWidthPx,
    frameWidthPx - leftPx - floor - RIGHT_RAIL_GUTTER_PX * 2,
  );
  // Maximize covers the middle: same left cost, zero center floor.
  const coverPx = Math.max(
    DETAIL_STACK_RESIZE.minWidthPx,
    frameWidthPx - leftPx - RIGHT_RAIL_GUTTER_PX * 2,
  );

  if (!wantsPush) {
    return { mode: 'overlay', capPx, coverPx };
  }

  // A resident non-modal inspector never flashes through the historical floating-card geometry while the content row is still being measured.
  return { mode: 'push', capPx, coverPx };
}

/** The narrowest content row that seats both the work-surface floor and panel minimum without constraining either (assuming no open context… */
export const RIGHT_RAIL_PUSH_MIN_FRAME_PX =
  MIN_WORK_SURFACE_PX + RIGHT_RAIL_GUTTER_PX * 2 + DETAIL_STACK_RESIZE.minWidthPx;

/** Pure hysteresis: */
export function resolveStationDisplaysCollapse(input: {
  frameWidthPx: number;
  leftCostPx: number;
  wasCollapsed: boolean;
  hysteresisPx?: number;
}): boolean {
  const frame = Number.isFinite(input.frameWidthPx) ? input.frameWidthPx : 0;
  // Unmeasured frame (0 on first paint) is not a collapse signal — hold prior
  // state so opening the bench never flashes a park before layout settles.
  if (frame <= 0) return input.wasCollapsed;
  const hyst = input.hysteresisPx ?? STATION_DISPLAYS_AUTO_CLOSE_HYSTERESIS_PX;
  const railSavings = CONTEXT_PANEL_RESIZE.minWidthPx - Math.max(0, input.leftCostPx);
  const closeAt = STATION_DISPLAYS_AUTO_CLOSE_FRAME_PX - railSavings;
  const reopenAt = closeAt + hyst * 2;
  return input.wasCollapsed ? frame < reopenAt : frame < closeAt;
}

/** The widest the station **Displays** sash may reach: */
export function stationDisplaysSashMaxPx(
  frameWidthPx: number,
  leftCostPx: number,
  centerFloorPx = STATION_PUSH_CENTER_FLOOR_PX,
  displaysMinPx = STATION_DISPLAYS_MIN_WIDTH_PX,
): number {
  const frame = Number.isFinite(frameWidthPx) ? Math.max(0, frameWidthPx) : 0;
  const left = Number.isFinite(leftCostPx) ? Math.max(0, leftCostPx) : 0;
  return Math.max(displaysMinPx, frame - centerFloorPx - left);
}

/** The widest the station **context** rail may reach: */
export function stationContextSashMaxPx(
  frameWidthPx: number,
  displaysWidthPx: number,
  centerFloorPx = STATION_PUSH_CENTER_FLOOR_PX,
  leftMinPx = CONTEXT_PANEL_RESIZE.minWidthPx,
): number {
  const frame = Number.isFinite(frameWidthPx) ? Math.max(0, frameWidthPx) : 0;
  const displays = Number.isFinite(displaysWidthPx) ? Math.max(0, displaysWidthPx) : 0;
  return Math.max(leftMinPx, frame - centerFloorPx - displays);
}

// ── The store ────────────────────────────────────────────────────────────────

type Listener = () => void;

const listeners = new Set<Listener>();

/** Frame inputs are split across writers: */
const state: RightRailFrameInput & {
  /** Preferred width still published by hosts (drag freeze / diagnostics); not a ladder input. */
  desiredWidthPx: number;
  stationPushActive: boolean;
  stationPushDesiredWidthPx: number;
  /** Sticky prior collapse state — the hysteresis latch. */
  stationDisplaysCollapsed: boolean;
  /** True while the operator is DRAGGING the Displays sash — the one signal that flips the two sash caps into their Stage-2 (far-rail-yields)… */
  stationDisplaysSashDragging: boolean;
  /** True while the Displays sash is armed to park the context rail (Stage 3). */
  stationDisplaysSashArmed: boolean;
  /** True while the context sash is armed to close Displays (reverse Stage 3). */
  stationContextSashArmed: boolean;
} = {
  frameWidthPx: 0,
  railCostOpenPx: 0,
  railOperatorCollapsed: false,
  wantsPush: false,
  centerFloorPx: MIN_WORK_SURFACE_PX,
  desiredWidthPx: DETAIL_STACK_RESIZE.defaultWidthPx,
  stationPushActive: false,
  stationPushDesiredWidthPx: DETAIL_STACK_RESIZE.defaultWidthPx,
  stationDisplaysCollapsed: false,
  stationDisplaysSashDragging: false,
  stationDisplaysSashArmed: false,
  stationContextSashArmed: false,
};

let snapshot: RightRailFrameSnapshot = {
  ...resolveRightRailFrame(state),
  stationDisplaysCollapsed: false,
  stationDisplaysCapPx: DETAIL_STACK_RESIZE.defaultWidthPx,
  stationContextCapPx: CONTEXT_PANEL_RESIZE.minWidthPx,
  stationDisplaysSashArmed: false,
  stationContextSashArmed: false,
};

const SERVER_SNAPSHOT: RightRailFrameSnapshot = {
  mode: 'overlay',
  capPx: DETAIL_STACK_RESIZE.defaultWidthPx,
  coverPx: DETAIL_STACK_RESIZE.defaultWidthPx,
  stationDisplaysCollapsed: false,
  stationDisplaysCapPx: DETAIL_STACK_RESIZE.defaultWidthPx,
  stationContextCapPx: CONTEXT_PANEL_RESIZE.minWidthPx,
  stationDisplaysSashArmed: false,
  stationContextSashArmed: false,
};

function frameInputFromState(): RightRailFrameInput {
  const station = state.stationPushActive;
  return {
    frameWidthPx: state.frameWidthPx,
    railCostOpenPx: state.railCostOpenPx,
    railOperatorCollapsed: state.railOperatorCollapsed,
    wantsPush: state.wantsPush || station,
    // Station Displays — floor = workbench lock (720) so middle never yields.
    // Desk inspectors keep the outbound/work-surface floor.
    centerFloorPx: station ? STATION_PUSH_CENTER_FLOOR_PX : MIN_WORK_SURFACE_PX,
  };
}

function recompute() {
  const next = resolveRightRailFrame(frameInputFromState());
  // The left rail's live resting cost — actual open width, parked strip, or 0.
  const leftCost = restingLeftPx(state);
  const station = state.stationPushActive;

  // Prefer parking the LEFT rail so an open Displays can stay seated on a small
  // width (operator ask 2026-08-10). Desk inspectors do not take this path —
  const preferParkLeft =
    station &&
    state.railCostOpenPx > 0 &&
    !state.railOperatorCollapsed &&
    state.frameWidthPx > 0 &&
    state.frameWidthPx <
      leftCost + STATION_PUSH_CENTER_FLOOR_PX + STATION_DISPLAYS_MIN_WIDTH_PX;
  if (preferParkLeft) {
    requestStationCollapseContext();
  }

  // Displays parks only when even a parked left (or no rail) cannot seat it.
  // Pass the yielded left cost — not the open width — so opening Displays on a
  // tight frame parks the left first and keeps Displays open down to ~1032.
  const leftCostForDisplaysPark =
    state.railCostOpenPx <= 0 ? 0 : CONTEXT_RAIL_PARKED_PX;
  const collapsed = resolveStationDisplaysCollapse({
    frameWidthPx: state.frameWidthPx,
    leftCostPx: leftCostForDisplaysPark,
    wasCollapsed: state.stationDisplaysCollapsed,
  });
  state.stationDisplaysCollapsed = collapsed;
  // Directional sash caps — the cascade.
  const displaysDragging = state.stationDisplaysSashDragging;
  const looseLeftMinPx =
    state.railCostOpenPx <= 0
      ? 0
      : state.railOperatorCollapsed || preferParkLeft
        ? CONTEXT_RAIL_PARKED_PX
        : CONTEXT_PANEL_RESIZE.minWidthPx;
  const idleLeftCost =
    preferParkLeft && state.railCostOpenPx > 0 ? CONTEXT_RAIL_PARKED_PX : leftCost;
  const stationDisplaysCapPx = stationDisplaysSashMaxPx(
    state.frameWidthPx,
    displaysDragging ? looseLeftMinPx : idleLeftCost,
  );  const stationContextCapPx = stationContextSashMaxPx(
    state.frameWidthPx,
    displaysDragging ? state.stationPushDesiredWidthPx : STATION_DISPLAYS_MIN_WIDTH_PX,
  );
  // Cached snapshot: `useSyncExternalStore` re-renders on identity change, so a
  // no-op publish (a ResizeObserver firing at the same width) must not churn.
  if (
    next.mode === snapshot.mode &&
    next.capPx === snapshot.capPx &&
    next.coverPx === snapshot.coverPx &&
    collapsed === snapshot.stationDisplaysCollapsed &&
    stationDisplaysCapPx === snapshot.stationDisplaysCapPx &&
    stationContextCapPx === snapshot.stationContextCapPx &&
    state.stationDisplaysSashArmed === snapshot.stationDisplaysSashArmed &&
    state.stationContextSashArmed === snapshot.stationContextSashArmed
  ) {
    return;
  }
  snapshot = {
    ...next,
    stationDisplaysCollapsed: collapsed,
    stationDisplaysCapPx,
    stationContextCapPx,
    stationDisplaysSashArmed: state.stationDisplaysSashArmed,
    stationContextSashArmed: state.stationContextSashArmed,
  };
  listeners.forEach((l) => l());
}

/** True when opening station Displays at the current frame would park the left rail. */
export function stationDisplaysOpenWouldParkRail(): boolean {
  if (!state.stationPushActive) return false;
  if (state.railCostOpenPx <= 0) return false;
  if (state.railOperatorCollapsed) return false;
  const frame = state.frameWidthPx;
  // Unmeasured frame: refuse auto-open so a later measure cannot park after paint.
  if (frame <= 0) return true;
  const leftCost = restingLeftPx(state);
  return (
    frame <
    leftCost + STATION_PUSH_CENTER_FLOOR_PX + STATION_DISPLAYS_MIN_WIDTH_PX
  );
}

export function subscribeRightRailFrame(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRightRailFrame(): RightRailFrameSnapshot {
  return snapshot;
}

export function getServerRightRailFrame(): RightRailFrameSnapshot {
  return SERVER_SNAPSHOT;
}

/** `ResponsiveLayout` — the content row's measured width. */
export function setRightRailFrameWidth(frameWidthPx: number): void {
  if (state.frameWidthPx === frameWidthPx) return;
  state.frameWidthPx = frameWidthPx;
  recompute();
}

/** `ContextPanelLayout` — the route rail's OPEN cost + the operator's own collapse. */
export function setRightRailContextRail(next: {
  railCostOpenPx: number;
  railOperatorCollapsed: boolean;
}): void {
  if (
    state.railCostOpenPx === next.railCostOpenPx &&
    state.railOperatorCollapsed === next.railOperatorCollapsed
  ) {
    return;
  }
  state.railCostOpenPx = next.railCostOpenPx;
  state.railOperatorCollapsed = next.railOperatorCollapsed;
  recompute();
}

/** `RightRailHost` — whether the current occupant wants to push, and how wide. */
export function setRightRailDemand(next: {
  wantsPush: boolean;
  desiredWidthPx: number;
}): void {
  if (state.wantsPush === next.wantsPush && state.desiredWidthPx === next.desiredWidthPx) return;
  state.wantsPush = next.wantsPush;
  state.desiredWidthPx = next.desiredWidthPx;
  recompute();
}

/**
 * Unbox station push (`StationDisplaysPushColumn`) — separate writer from RightRailHost so
 * assistant `push: false` cannot clear the width-budget demand a Displays/Claim/
 * Ticket/tool column needs at 1440.
 */
export function setStationPushDemand(next: {
  active: boolean;
  desiredWidthPx: number;
}): void {
  if (
    state.stationPushActive === next.active &&
    state.stationPushDesiredWidthPx === next.desiredWidthPx
  ) {
    return;
  }
  state.stationPushActive = next.active;
  state.stationPushDesiredWidthPx = next.desiredWidthPx;
  recompute();
}

/** `StationDisplaysPushColumn` — is the operator DRAGGING the Displays sash right now? */
export function setStationDisplaysSashDragging(dragging: boolean): void {
  if (state.stationDisplaysSashDragging === dragging) return;
  state.stationDisplaysSashDragging = dragging;
  recompute();
}

/** `StationDisplaysPushColumn` — is the Displays sash ARMED to park the context rail (dragging past its cap into the Stage-3 slack, one… */
export function setStationDisplaysSashArmed(armed: boolean): void {
  if (state.stationDisplaysSashArmed === armed) return;
  state.stationDisplaysSashArmed = armed;
  recompute();
}

/**
 * `ContextPanelLayout` — is the context sash ARMED to close Displays (the reverse
 * cascade)? Relayed so the far Displays column lights its own seam warning.
 */
export function setStationContextSashArmed(armed: boolean): void {
  if (state.stationContextSashArmed === armed) return;
  state.stationContextSashArmed = armed;
  recompute();
}

// ── Stage-3 "close the far rail" request bus ────────────────────────────────
type StationFarRailRequest = 'collapse-context' | 'close-displays';
const farRailListeners = new Set<(req: StationFarRailRequest) => void>();

export function subscribeStationFarRailRequest(
  fn: (req: StationFarRailRequest) => void,
): () => void {
  farRailListeners.add(fn);
  return () => {
    farRailListeners.delete(fn);
  };
}

/** Displays-sash overshoot → the context rail's owner parks it. Idempotent. */
export function requestStationCollapseContext(): void {
  farRailListeners.forEach((fn) => fn('collapse-context'));
}

/** Context-sash overshoot → the Displays column's owner closes it. Idempotent. */
export function requestStationCloseDisplays(): void {
  farRailListeners.forEach((fn) => fn('close-displays'));
}

/** The rail's open cost — flush column width (no outer gutter islands). */
export function contextRailCostPx(openWidthPx = CONTEXT_PANEL_WIDTH_PX): number {
  return openWidthPx + RIGHT_RAIL_GUTTER_PX * 2;
}

/** True while a station Displays column is an in-flow push (not overlay). */
export function getStationPushActive(): boolean {
  return state.stationPushActive;
}

/** Viewport pad for station Unbox / Arrival / Testing Displays push resize. */
export const UNBOX_STATION_PUSH_MAX_WIDTH_PAD_PX = 0;
