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
 * reserves {@link STATION_PUSH_CENTER_FLOOR_PX} (720 — the center floor) so the
 * middle never yields below it. Cap: `left + centerFloor + right ≤ frame`. Never
 * a floating card over the work.
 *
 * MasterNav spine remains operator-owned (`SidebarNavColumn` never auto-closes).
 *
 * ## The station frame — elastic center, local sashes (Option A, 2026-08-10)
 *
 * The three-column Station frame (Context · **elastic** Primary · Displays) is
 * the VS Code editor model with a cascade: the center is the primary elastic
 * absorber, and the OPPOSITE rail is the secondary absorber once the center is
 * exhausted. Dragging a sash a little never moves the far rail (the center
 * absorbs — an operator flagged the old always-coupled behaviour as unintuitive);
 * dragging it far — past the point where the center hits its 720 floor — lets the
 * far rail yield so the pane can keep growing.
 *
 *  - **Stage 1 (center absorbs):** while the center is above its 720 floor, a
 *    sash resizes only its own rail and the flex-1 center takes the change; the
 *    far rail is untouched.
 *  - **Stage 2 (far rail yields):** the ACTIVE sash's cap opens to the ladder max
 *    (`frame − peerMin − 720`) while it is being dragged, so it can grow past the
 *    center floor; the PASSIVE rail's cap goes tight (`frame − active − 720`) and
 *    its own resize-clamp shrinks it toward its min. One-directional (active →
 *    passive), so there is no bidirectional coupling to oscillate. The single
 *    signal is {@link setStationDisplaysSashDragging} — the LEFT rail is the
 *    default authority (loose) while idle; opening Displays or narrowing the
 *    viewport prefers parking the LEFT rail so Displays stays open.
 *  - Below the open-left min-fit threshold with Displays open: **park the left
 *    rail first** ({@link requestStationCollapseContext}). Displays only
 *    auto-parks ({@link resolveStationDisplaysCollapse}) when even a parked
 *    left strip cannot seat it — never overlays, never off-screen overflow.
 *
 * Pure sash-cap math: {@link stationDisplaysSashMaxPx} / {@link stationContextSashMaxPx}
 * (`frame − arg − 720`, floored at the pane's min). The store feeds the peer's
 * MIN (loose) or ACTUAL width (tight) depending on which sash is active.
 *
 * The DESK lane (context 360 · primary {@link MIN_WORK_SURFACE_PX} 784 ·
 * inspector {@link DETAIL_STACK_RESIZE} 360/420) resolves through
 * {@link resolveRightRailFrame}; its budget is proved by `frame.test.ts`, which
 * also proves the station caps + collapse.
 *
 * ## The cap arithmetic now lives in the N-pane solver (2026-08-22)
 *
 * All three cap functions here were computing the same thing by hand —
 * `frame − what the other panes hold − the center floor`, floored at the pane's
 * own minimum. The tiling canvas needs that answer for N panes, not three, so it
 * moved to `@/lib/canvas/geometry`'s {@link paneCapPx} and these three call it.
 *
 * Nothing about the budget changed: the 22 cases in `frame.test.ts` pass
 * unchanged, which is the entire point of moving it this way round. What the
 * three functions still own — and what a generic solver must never learn — is
 * **which** width to feed it: a peer's MIN (a loose cap, "grow until they are at
 * their floor") or a peer's ACTUAL width (a tight cap, "grow into the leftover").
 * That choice is the station cascade, and only the caller knows which sash the
 * operator has hold of.
 *
 * One behaviour did change, deliberately: a non-finite `frameWidthPx` now reads
 * as `0` instead of poisoning the subtraction and returning `NaN` as a cap. The
 * two station functions already sanitized exactly this way; the desk resolver
 * did not, so a `NaN` frame produced a `NaN` ceiling that a consumer's
 * `Math.min(width, cap)` would silently turn into a `NaN` width. The unmeasured
 * frame (`0` on first paint) reaches the same floor by both routes.
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
} from '@/lib/sidebar/context-panel-column';
import {
  STATION_DISPLAYS_AUTO_CLOSE_FRAME_PX,
  STATION_DISPLAYS_AUTO_CLOSE_HYSTERESIS_PX,
  STATION_DISPLAYS_MIN_WIDTH_PX,
  STATION_WORKBENCH_LOCK_PX,
} from '@/lib/station/workbench-layout';
import { DETAIL_STACK_RESIZE } from '@/lib/design/detail-stack-resize';
import { paneCapPx } from '@/lib/canvas/geometry';

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
   * Station Displays has auto-parked to the slim right-edge strip at this frame
   * width ({@link resolveStationDisplaysCollapse}). Not an overlay — the middle
   * / dock stay visible; Displays does not paint off-screen. Consumers render
   * the parked strip while this is true.
   */
  stationDisplaysCollapsed: boolean;
  /**
   * Local clamp for the station **Displays** sash — the widest Displays may reach
   * beside the live left-rail cost and the 720 center floor
   * ({@link stationDisplaysSashMaxPx}). Reactive so the sash updates when the
   * left rail changes, without any inverse coupling.
   */
  stationDisplaysCapPx: number;
  /**
   * Local clamp for the station **context** sash — the widest the rail may reach
   * beside the current Displays width and the 720 center floor
   * ({@link stationContextSashMaxPx}). Reactive so the sash updates when Displays
   * changes, without any inverse coupling.
   */
  stationContextCapPx: number;
  /**
   * The **Displays** sash is armed to park the CONTEXT rail — the operator is
   * dragging Displays past its cap (the rail already pinned at its min) into the
   * Stage-3 slack. Relayed so `ContextPanelLayout` lights its own seam warning
   * (the sash and the far rail live in different subtrees). One writer:
   * {@link setStationDisplaysSashArmed}.
   */
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
 *
 * Three panes — the route rail, the center, the inspector — expressed as the
 * N-pane solver's question: "how wide may the inspector be, beside these two?"
 */
export function resolveRightRailFrame(input: RightRailFrameInput): RightRailFrameResolution {
  const { frameWidthPx, wantsPush, centerFloorPx } = input;
  const leftPx = restingLeftPx(input);
  const floor = Number.isFinite(centerFloorPx) && centerFloorPx > 0 ? centerFloorPx : 0;

  // Cap against the ACTUAL left cost so the operator can keep the context rail
  // open while the right panel grows. Station push passes
  // STATION_PUSH_CENTER_FLOOR_PX (720); desk inspectors pass MIN_WORK_SURFACE_PX.
  const capPx = paneCapPx({
    framePx: frameWidthPx,
    minPx: DETAIL_STACK_RESIZE.minWidthPx,
    reservedPx: [leftPx, floor],
    gutterPx: RIGHT_RAIL_GUTTER_PX,
    gutters: 2,
  });

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
 * Pure hysteresis: should the station Displays column auto-park (slim strip)
 * at this frame width?
 *
 * Prefer parking the **left** rail first so Displays can stay open on a small
 * width. Callers therefore pass `leftCostPx` as the left rail's **yielded**
 * cost ({@link CONTEXT_RAIL_PARKED_PX} when a rail exists, else 0) — not the
 * open width. Displays only parks when even a parked left cannot seat its
 * hardMin (280) beside the center floor (720). Close edge is HARD at that
 * threshold. It only REOPENS once the frame clears the threshold by the full
 * deadband (`2 × hysteresisPx`).
 *
 * The named sum {@link STATION_DISPLAYS_AUTO_CLOSE_FRAME_PX} (300 + 720 + 280)
 * is the open-rail-at-min diagnostic; with a parked strip
 * (`leftCostPx = 32`) closeAt drops to `32 + 720 + 280`.
 */
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

/**
 * The widest the station **Displays** sash may reach: `frame − leftCost − floor`,
 * floored at the Displays min (280). The store passes the left rail's ACTUAL cost
 * when Displays is idle (the sash stops at the center floor — the left rail is
 * untouched), or the left rail's MIN while Displays is being dragged (Stage 2 —
 * the sash may grow past the center floor and the left rail yields toward its min
 * via its own resize-clamp). Replaces the desk `capPx`'s 360 floor, which was too
 * high for a 280-min station column.
 */
export function stationDisplaysSashMaxPx(
  frameWidthPx: number,
  leftCostPx: number,
  centerFloorPx = STATION_PUSH_CENTER_FLOOR_PX,
  displaysMinPx = STATION_DISPLAYS_MIN_WIDTH_PX,
): number {
  return paneCapPx({
    framePx: frameWidthPx,
    minPx: displaysMinPx,
    reservedPx: [centerFloorPx, leftCostPx],
  });
}

/**
 * The widest the station **context** rail may reach: `frame − displays − floor`,
 * floored at the context min (300). Symmetric to {@link stationDisplaysSashMaxPx}.
 * The store passes Displays' MIN when Displays is idle (the LEFT rail is the
 * default authority — its sash may grow to the ladder max, and Displays yields
 * toward its own min via its resize-clamp), or Displays' ACTUAL width while
 * Displays is being dragged (the rail's cap goes tight so the rail yields to the
 * growing Displays — Stage 2).
 */
export function stationContextSashMaxPx(
  frameWidthPx: number,
  displaysWidthPx: number,
  centerFloorPx = STATION_PUSH_CENTER_FLOOR_PX,
  leftMinPx = CONTEXT_PANEL_RESIZE.minWidthPx,
): number {
  return paneCapPx({
    framePx: frameWidthPx,
    minPx: leftMinPx,
    reservedPx: [centerFloorPx, displaysWidthPx],
  });
}

// ── The store ────────────────────────────────────────────────────────────────

type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * Frame inputs are split across writers:
 *  - RightRailHost → `wantsPush` / `desiredWidthPx` (inspector / assistant slot)
 *  - StationDisplaysPushColumn → `stationPushActive` / `stationPushDesiredWidthPx`
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
  /**
   * True while the operator is DRAGGING the Displays sash — the one signal that
   * flips the two sash caps into their Stage-2 (far-rail-yields) configuration.
   * Idle: the LEFT rail is the default authority (loose). See the cascade
   * docblock at the top of this file.
   */
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
  // `station` is false for them. Idempotent: ContextPanelLayout collapse is a
  // no-op when already parked.
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
  // Directional sash caps — the cascade. The center absorbs first (Stage 1);
  // once it hits its floor the FAR rail yields (Stage 2), driven only by whether
  // the Displays sash is being dragged:
  //  - Displays DRAGGING → Displays cap opens to the ladder max (peer at its MIN)
  //    so it can grow past the center floor, and the left rail's cap goes tight
  //    (`frame − displays − 720`) so the rail's own resize-clamp yields it.
  //  - Otherwise (idle / context drag) → the LEFT rail is authority: its cap is
  //    the ladder max (Displays at its MIN) and Displays' cap is tight
  //    (`frame − leftCost − 720`) so Displays yields on open / viewport narrow /
  //    a context-sash drag. One-directional (active → passive) — no oscillation.
  // When we just requested preferParkLeft, size Displays against the parked
  // strip immediately so it does not paint off-screen for a frame while the
  // left rail's React collapse catches up.
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

/**
 * True when opening station Displays at the current frame would park the left
 * rail. Cold-load gate for cockpit auto-open — opening Displays that parks the
 * rail shifts the surface ~328px after paint (CLS 0.227).
 *
 * Reads the **frame store** (same threshold as `preferParkLeft` in
 * {@link recompute}). Never `window.innerWidth` — that version reported "fits"
 * at 1350px against a 1318px content row and moved CLS not at all.
 */
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

/**
 * `StationDisplaysPushColumn` — is the operator DRAGGING the Displays sash right
 * now? This flips the two sash caps into their Stage-2 configuration (Displays
 * loose so it can grow past the center floor; the left rail tight so it yields).
 * The left rail is the default authority when this is false.
 */
export function setStationDisplaysSashDragging(dragging: boolean): void {
  if (state.stationDisplaysSashDragging === dragging) return;
  state.stationDisplaysSashDragging = dragging;
  recompute();
}

/**
 * `StationDisplaysPushColumn` — is the Displays sash ARMED to park the context
 * rail (dragging past its cap into the Stage-3 slack, one shove from closing)?
 * Relayed so the far context rail lights its own seam warning. One writer, so it
 * never stomps the reverse ({@link setStationContextSashArmed}).
 */
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
//
// The far rail lives in a different component than the sash that closes it: a
// Displays-sash overshoot must park the CONTEXT rail (owned by
// `ContextPanelLayout`), and a context-sash overshoot must close DISPLAYS (owned
// by `StationDisplaysPushColumn`). Neither can call the other directly, so the
// active sash requests through this tiny emitter and the far rail's owner acts.
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

/**
 * Viewport pad for station Unbox / Arrival / Testing Displays push resize.
 * `0` — the hard stop is {@link STATION_PUSH_CENTER_FLOOR_PX} (720) via
 * `resolveRightRailFrame`, not a viewport pad. Desk inspectors still use
 * {@link MIN_WORK_SURFACE_PX} via `resolveRightRailFrame`.
 */
export const UNBOX_STATION_PUSH_MAX_WIDTH_PAD_PX = 0;
