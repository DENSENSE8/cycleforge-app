'use client';

/**
 * Right-rail FRAME store + the push/overlay decision.
 *
 * `store.ts` answers "who is in the right-edge slot". This answers the other
 * half — "can that occupant PUSH the work surface, and how wide may it grow".
 *
 * ## Why a store and not a prop
 *
 * The three parties are in three different subtrees and none of them can see the
 * others: `ResponsiveLayout` owns the content row's width, `ContextPanelLayout`
 * owns the route rail's width and collapse, and `RightRailHost` owns the panel's
 * demand. Threading that through would mean lifting two pieces of state into the
 * app frame and prop-drilling them past every route. A module singleton with the
 * same subscribe/emit/cached-snapshot shape as {@link RightRailPanel}'s store is
 * the idiom this file already uses next door.
 *
 * ## Width pressure (ruled 2026-08-05)
 *
 * Opening a right-edge panel must **not** auto-close or ephemeral-mask the left
 * context rail. Both stay open. Desk inspectors reserve
 * {@link MIN_WORK_SURFACE_PX} for the center. Scan-station Displays push
 * reserves {@link STATION_PUSH_CENTER_FLOOR_PX} (720 — the workbench lock) so
 * the middle never yields below that floor. Cap: `left + centerFloor + right ≤
 * frame`. Never a floating card over the work.
 *
 * MasterNav spine remains operator-owned (`SidebarNavColumn` never auto-closes).
 *
 * ## The yield ladder (Fiori / M3 collapse hierarchy)
 *
 * The three-column Station frame (Context · locked Primary · Displays) is a
 * width BUDGET, distributed by a `shrinkPriority` ladder rather than crushed
 * uniformly. Precedent:
 *  - **SAP Fiori Flexible Column Layout** — when the viewport narrows, columns
 *    collapse in a defined priority order; the column you are working in is
 *    preserved while a supporting column yields.
 *  - **Material 3 supporting-pane** — the *supporting* pane collapses to an
 *    overlay before the *primary* pane is squeezed.
 *
 * Here the middle (720 workbench lock) is Locked (`shrinkPriority: 0`), Displays
 * yields first (`1` — {@link resolveStationDisplaysCollapse} collapses it to an
 * overlay at the auto-close threshold), and the context rail yields second
 * (`2`, toward its 300 hardMin). Tuple SoT: {@link STATION_COLUMN_BUDGET}. The
 * DESK lane (context 360 · primary {@link MIN_WORK_SURFACE_PX} 784 · inspector
 * {@link DETAIL_STACK_RESIZE} 360/420) resolves through
 * {@link resolveRightRailFrame} rather than the station ladder, and its budget
 * is proved by `frame.test.ts`. Pure distributor + invariants I1–I7:
 * `station-dual-rail.ts` → `resolveStationYieldLadder`.
 *
 * ## Why the inputs cannot oscillate
 *
 * `frameWidthPx` is measured on the content ROW, whose width is invariant under
 * everything this resolver decides — growing the panel redistributes space
 * *inside* it. And `railCostOpenPx` is the rail's OPEN width from its resize
 * state, never a live measurement of a parked DOM, so the resolver can always
 * ask "what does the left cost" without reading back the consequence of its
 * own answer. A resolver fed the grid's live `contentMinWidthRem` instead would
 * be circular: on `/dashboard` that value is filtered by a `ResizeObserver` on
 * the very scrollport the push narrows.
 */

import {
  CONTEXT_PANEL_COLLAPSE,
  CONTEXT_PANEL_RESIZE,
  CONTEXT_PANEL_WIDTH_PX,
} from '@/components/sidebar/context-panel-column';
import {
  STATION_DISPLAYS_AUTO_CLOSE_FRAME_PX,
  STATION_DISPLAYS_AUTO_CLOSE_HYSTERESIS_PX,
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

/**
 * The work surface's floor for **desk** inspectors (dashboard / History peek).
 *
 * Derived from Outbound show-all (~704). Scan-station Displays push publishes
 * {@link STATION_PUSH_CENTER_FLOOR_PX} (720) so the middle stays locked while
 * rails trade width. Desk keeps this floor so the queue stays readable.
 *
 * **Deliberately ONE static constant for desk, not a per-lane published floor.**
 * On `/dashboard` `contentMinWidthRem` is filtered by a `ResizeObserver` on the
 * scrollport the push resizes — feeding it back would be circular.
 */
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
  /** Ceiling for the panel's drag-resize while pushing. */
  capPx: number;
}

/**
 * The store's published snapshot — the pure frame resolution PLUS the reactive
 * Displays-collapse flag (hysteresis needs prior state, so it lives in the
 * store, not in the pure {@link resolveRightRailFrame}).
 */
interface RightRailFrameSnapshot extends RightRailFrameResolution {
  /**
   * Station Displays has yielded to an overlay at this frame width (Fiori / M3
   * collapse hierarchy — {@link resolveStationDisplaysCollapse}). Consumers use
   * it to float Displays (rather than crush the 720 middle) and to fill the
   * center when Displays is no longer an in-flow sibling.
   */
  stationDisplaysCollapsed: boolean;
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

  if (!wantsPush) {
    return { mode: 'overlay', capPx };
  }

  // A resident non-modal inspector never flashes through the historical
  // floating-card geometry while the content row is still being measured.
  // Whether the preferred width fits the surplus or not, we still PUSH and let
  // `capPx` / the flex center constrain — never park the left donor, never overlay.
  return { mode: 'push', capPx };
}

/**
 * The narrowest content row that seats both the work-surface floor and panel
 * minimum without constraining either (assuming no open context rail). Below
 * this, the rail still pushes; this value is diagnostic geometry, not an
 * overlay breakpoint.
 */
export const RIGHT_RAIL_PUSH_MIN_FRAME_PX =
  MIN_WORK_SURFACE_PX + RIGHT_RAIL_GUTTER_PX * 2 + DETAIL_STACK_RESIZE.minWidthPx;

/**
 * Pure hysteresis: should the station Displays column COLLAPSE (yield to an
 * overlay) at this frame width?
 *
 * Displays yields first (Fiori / M3 collapse hierarchy). It CLOSES the instant
 * it can no longer hold its hardMin beside the locked middle and a context rail
 * already yielded to `minLeftPx` — the close edge is HARD at that threshold, so
 * an OPEN Displays is always one that genuinely fits (invariant I6). It only
 * REOPENS once the frame clears the threshold by the full deadband
 * (`2 × hysteresisPx`), so a manual drag or a scrollbar-injection blip near the
 * boundary cannot flap it open/closed.
 *
 * The close threshold is the named budget sum
 * {@link STATION_DISPLAYS_AUTO_CLOSE_FRAME_PX} (300 + 720 + 280) at the rail-open
 * case; parking the rail (or a route with no rail) lowers it by exactly what the
 * rail no longer costs, so Displays survives to a narrower frame — the rail has
 * already yielded. `minLeftPx` is the rail's resting minimum: its 300 hardMin
 * when open, the {@link CONTEXT_RAIL_PARKED_PX} strip when parked, or 0 when
 * there is no rail.
 */
export function resolveStationDisplaysCollapse(input: {
  frameWidthPx: number;
  minLeftPx: number;
  wasCollapsed: boolean;
  hysteresisPx?: number;
}): boolean {
  const frame = Number.isFinite(input.frameWidthPx) ? input.frameWidthPx : 0;
  // Unmeasured frame (0 on first paint) is not a collapse signal — hold prior
  // state so opening the bench never flashes an overlay before layout settles.
  if (frame <= 0) return input.wasCollapsed;
  const hyst = input.hysteresisPx ?? STATION_DISPLAYS_AUTO_CLOSE_HYSTERESIS_PX;
  const railSavings = CONTEXT_PANEL_RESIZE.minWidthPx - Math.max(0, input.minLeftPx);
  const closeAt = STATION_DISPLAYS_AUTO_CLOSE_FRAME_PX - railSavings;
  const reopenAt = closeAt + hyst * 2;
  return input.wasCollapsed ? frame < reopenAt : frame < closeAt;
}

// ── The store ────────────────────────────────────────────────────────────────

type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * Frame inputs are split across writers:
 *  - RightRailHost → `wantsPush` / `desiredWidthPx` (inspector / assistant slot)
 *  - UnboxPushColumn → `stationPushActive` / `stationPushDesiredWidthPx`
 *
 * `resolveRightRailFrame` sees the OR of both push demands so a station push
 * still publishes into the shared width budget (cap) while the assistant stays
 * `push: false`.
 */
const state: RightRailFrameInput & {
  /** Preferred width still published by hosts (drag freeze / diagnostics); not a ladder input. */
  desiredWidthPx: number;
  stationPushActive: boolean;
  stationPushDesiredWidthPx: number;
  /** Sticky prior collapse state — the hysteresis latch. */
  stationDisplaysCollapsed: boolean;
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
};

/** Rail cost the frame reserves at its floor — 300 open · strip parked · 0 none. */
function restingMinLeftPx(): number {
  if (state.railCostOpenPx <= 0) return 0;
  return state.railOperatorCollapsed
    ? CONTEXT_RAIL_PARKED_PX
    : CONTEXT_PANEL_RESIZE.minWidthPx;
}

let snapshot: RightRailFrameSnapshot = {
  ...resolveRightRailFrame(state),
  stationDisplaysCollapsed: false,
};

const SERVER_SNAPSHOT: RightRailFrameSnapshot = {
  mode: 'overlay',
  capPx: DETAIL_STACK_RESIZE.defaultWidthPx,
  stationDisplaysCollapsed: false,
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
  // Displays-collapse latch (hysteresis) — reads the sticky prior state, so the
  // deadband holds. Independent of push demand / cap, so it cannot loop with the
  // push column's `setStationPushDemand` writes (collapse depends only on frame
  // + rail cost).
  const collapsed = resolveStationDisplaysCollapse({
    frameWidthPx: state.frameWidthPx,
    minLeftPx: restingMinLeftPx(),
    wasCollapsed: state.stationDisplaysCollapsed,
  });
  state.stationDisplaysCollapsed = collapsed;
  // Cached snapshot: `useSyncExternalStore` re-renders on identity change, so a
  // no-op publish (a ResizeObserver firing at the same width) must not churn.
  if (
    next.mode === snapshot.mode &&
    next.capPx === snapshot.capPx &&
    collapsed === snapshot.stationDisplaysCollapsed
  ) {
    return;
  }
  snapshot = { ...next, stationDisplaysCollapsed: collapsed };
  listeners.forEach((l) => l());
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

/**
 * Reactive: has station Displays yielded to an overlay at the current frame?
 * `useSyncExternalStore(subscribeRightRailFrame, getStationDisplaysCollapsed,
 * () => false)`. Same store as the frame budget, so a single frame measurement
 * updates cap + collapse together.
 */
export function getStationDisplaysCollapsed(): boolean {
  return snapshot.stationDisplaysCollapsed;
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
 * Unbox station push (`UnboxPushColumn`) — separate writer from RightRailHost so
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

/** The rail's open cost — flush column width (no outer gutter islands). */
export function contextRailCostPx(openWidthPx = CONTEXT_PANEL_WIDTH_PX): number {
  return openWidthPx + RIGHT_RAIL_GUTTER_PX * 2;
}

/** Live frame inputs for station dual-rail coupling (`station-dual-rail.ts`). */
export function getRightRailFrameWidthPx(): number {
  return state.frameWidthPx;
}

export function getContextRailCostOpenPx(): number {
  return state.railCostOpenPx;
}

export function getRailOperatorCollapsed(): boolean {
  return state.railOperatorCollapsed;
}

export function getStationPushActive(): boolean {
  return state.stationPushActive;
}

export function getStationPushDesiredWidthPx(): number {
  return state.stationPushDesiredWidthPx;
}

/**
 * Viewport pad for station Unbox / Arrival / Testing Displays push resize.
 * `0` — the hard stop is {@link STATION_PUSH_CENTER_FLOOR_PX} (720) via
 * `resolveRightRailFrame`, not a viewport pad. Desk inspectors still use
 * {@link MIN_WORK_SURFACE_PX} via `resolveRightRailFrame`.
 */
export const UNBOX_STATION_PUSH_MAX_WIDTH_PAD_PX = 0;
