'use client';

/**
 * Right-rail FRAME store + the push/overlay decision.
 *
 * `store.ts` answers "who is in the right-edge slot". This answers the other
 * half — "can that occupant PUSH the work surface, and what has to yield first".
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
 * ## The ladder, and why it has two rungs and not three
 *
 * `source-of-truth.md` (Right-rail modality) rules: "the panel takes its space
 * from the LEFT before it takes it from the grid: collapse/displace the spine
 * (and, if still short, the context rail) first".
 *
 * Measured against the running app (Playwright, 1440 and 1920, every route),
 * **`[data-sidebar-nav-column]` reports width 0** — `navOpen` is
 * `useState(false)` (`ResponsiveLayout.tsx`) and nothing persists it, so the
 * spine is closed unless the operator just opened it. A spine rung would be dead
 * code in the common case, and displacing it fights `SidebarNavColumn`'s own
 * ruling that a navigator must not auto-close. So the ladder is:
 *
 *   rung 0 — nothing yields; the panel fits in the surplus as the frame stands
 *   rung 1 — the CONTEXT RAIL parks (it is the only real donor: 360px + margins
 *            against the spine's 0), and the panel fits
 *   else   — overlay, exactly as before this change
 *
 * If the operator has the spine open and rung 1 still does not fit, the answer is
 * overlay rather than yanking their navigator shut mid-task.
 *
 * ## Why the inputs cannot oscillate
 *
 * `frameWidthPx` is measured on the content ROW, whose width is invariant under
 * everything this resolver decides — parking the rail and growing the panel both
 * redistribute space *inside* it. And `railCostOpenPx` is the rail's OPEN width
 * from its resize state, never a measurement of the parked DOM, so the resolver
 * can always ask "what would it cost if it were open" without reading back the
 * consequence of its own answer. A resolver fed the grid's live
 * `contentMinWidthRem` instead would be circular: on `/dashboard` that value is
 * filtered by a `ResizeObserver` on the very scrollport the push narrows.
 */

import { CONTEXT_PANEL_COLLAPSE, CONTEXT_PANEL_WIDTH_PX } from '@/components/sidebar/context-panel-column';
import { DETAIL_STACK_RESIZE } from '@/design-system/shells/detail-stack';

/** `m-2` on both the context-panel card and the push column (8px each side). */
export const RIGHT_RAIL_GUTTER_PX = 8;

/** What a parked context rail still costs: the 32px strip plus its margins. */
export const CONTEXT_RAIL_PARKED_PX = CONTEXT_PANEL_COLLAPSE.stripWidthPx + RIGHT_RAIL_GUTTER_PX * 2;

/**
 * The work surface's floor — the width below which pushing stops being a favour.
 *
 * Derived from two real surfaces, taking the larger:
 *  - Outbound grid: `VIEWPORT_SHOW_ALL_PX` 640 (`dashboard-order-row-layout.ts`
 *    — below this the grid starts force-hiding columns) + `WORKBENCH_GUTTERS`
 *    `lg:px-8` on both sides = 704.
 *  - Station workbench: `STATION_WORKBENCH_COLUMN` `max-w-[720px]` + its `px-6`
 *    gutters = 768.
 *
 * 784 clears both with a little air.
 *
 * **Deliberately ONE static constant, not a per-lane published floor.** The real
 * minimum differs per surface, and a descriptor could publish its own
 * `contentMinWidthRem` — but on `/dashboard` that number is computed from
 * `displayColumns`, which `useViewportForcedHidden` filters using a
 * `ResizeObserver` on the scrollport this push resizes. Feeding it back in would
 * make the decision depend on its own outcome. A conservative constant is the
 * honest input; a circular one is not.
 */
export const MIN_WORK_SURFACE_PX = 784;

interface RightRailFrameInput {
  /** Width of the content ROW (invariant under park/push — see the docblock). */
  frameWidthPx: number;
  /** The route rail's cost WHEN OPEN (card + margins). 0 when the route has none. */
  railCostOpenPx: number;
  /** True when the OPERATOR collapsed the rail — their choice, not our mask. */
  railOperatorCollapsed: boolean;
  /** False for occupants that must not push (station edge, assistant, modal). */
  wantsPush: boolean;
  /** The panel's current preferred width. */
  desiredWidthPx: number;
}

interface RightRailFrameResolution {
  mode: 'push' | 'overlay';
  /** Rung 1 — park the context rail for as long as the panel is open. */
  parkRail: boolean;
  /** Ceiling for the panel's drag-resize while pushing. */
  capPx: number;
}

/**
 * Pure. Every worked number in the unit test comes from here, so the ladder is
 * provable without mounting anything.
 */
export function resolveRightRailFrame(input: RightRailFrameInput): RightRailFrameResolution {
  const { frameWidthPx, railCostOpenPx, railOperatorCollapsed, wantsPush, desiredWidthPx } = input;

  // The cap is computed against the FULLY-PARKED frame on purpose: a ceiling
  // that moved when the rail parked would change under the operator's cursor
  // mid-drag, and it must not depend on the park state it helps decide.
  const capPx = Math.max(
    DETAIL_STACK_RESIZE.minWidthPx,
    frameWidthPx - CONTEXT_RAIL_PARKED_PX - MIN_WORK_SURFACE_PX - RIGHT_RAIL_GUTTER_PX * 2,
  );

  if (!wantsPush || !Number.isFinite(frameWidthPx) || frameWidthPx <= 0) {
    return { mode: 'overlay', parkRail: false, capPx };
  }

  // What the left costs at each rung. A rail the operator already parked costs
  // the strip either way, so rung 0 and rung 1 collapse into one for them.
  // A route with NO rail costs nothing at either rung — guarded here rather than
  // trusted from the publisher, because `railOperatorCollapsed` is a persisted
  // preference that outlives the route that set it.
  const hasRail = railCostOpenPx > 0;
  const restingLeftPx = hasRail
    ? railOperatorCollapsed
      ? CONTEXT_RAIL_PARKED_PX
      : railCostOpenPx
    : 0;
  // A PUSH-parked rail costs 0, not the strip: `ContextPanelLayout` renders the
  // expand strip only when the OPERATOR collapsed it. Masking the rail must not
  // leave a restore control that cannot work — the rail comes back on its own
  // when the panel closes — so the mask hides it entirely and the space it gives
  // back is the whole card plus both gutters.
  //
  // When the operator HAS collapsed it, their strip stays (it is their restore),
  // so rung 1 offers them nothing and the resolver will not claim a saving that
  // does not exist.
  const parkedLeftPx = hasRail && railOperatorCollapsed ? CONTEXT_RAIL_PARKED_PX : 0;

  const surplus = (leftPx: number) =>
    frameWidthPx - leftPx - MIN_WORK_SURFACE_PX - RIGHT_RAIL_GUTTER_PX * 2;

  const rungs: Array<{ parkRail: boolean; surplus: number }> = [
    { parkRail: false, surplus: surplus(restingLeftPx) },
    { parkRail: true, surplus: surplus(parkedLeftPx) },
  ];

  // Pass A — the first rung that seats the panel at the width it actually wants.
  const wanted = rungs.find((r) => r.surplus >= desiredWidthPx);
  if (wanted) return { mode: 'push', parkRail: wanted.parkRail, capPx };

  // Pass B — the first rung that seats it at its MINIMUM. Better a narrower
  // panel beside the work than a wide one on top of it.
  const minimal = rungs.find((r) => r.surplus >= DETAIL_STACK_RESIZE.minWidthPx);
  if (minimal) return { mode: 'push', parkRail: minimal.parkRail, capPx };

  // Neither rung fits — this is the sanctioned fallback, not a failure.
  return { mode: 'overlay', parkRail: false, capPx };
}

/**
 * The narrowest content row that can seat a pushing panel at its minimum, with
 * the route rail fully parked. Below this, overlay is the honest answer.
 */
export const RIGHT_RAIL_PUSH_MIN_FRAME_PX =
  MIN_WORK_SURFACE_PX + RIGHT_RAIL_GUTTER_PX * 2 + DETAIL_STACK_RESIZE.minWidthPx;

// ── The store ────────────────────────────────────────────────────────────────

type Listener = () => void;

const listeners = new Set<Listener>();

const state: RightRailFrameInput = {
  frameWidthPx: 0,
  railCostOpenPx: 0,
  railOperatorCollapsed: false,
  wantsPush: false,
  desiredWidthPx: DETAIL_STACK_RESIZE.defaultWidthPx,
};

let snapshot: RightRailFrameResolution = resolveRightRailFrame(state);

const SERVER_SNAPSHOT: RightRailFrameResolution = {
  mode: 'overlay',
  parkRail: false,
  capPx: DETAIL_STACK_RESIZE.defaultWidthPx,
};

function recompute() {
  const next = resolveRightRailFrame(state);
  // Cached snapshot: `useSyncExternalStore` re-renders on identity change, so a
  // no-op publish (a ResizeObserver firing at the same width) must not churn.
  if (
    next.mode === snapshot.mode &&
    next.parkRail === snapshot.parkRail &&
    next.capPx === snapshot.capPx
  ) {
    return;
  }
  snapshot = next;
  listeners.forEach((l) => l());
}

export function subscribeRightRailFrame(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRightRailFrame(): RightRailFrameResolution {
  return snapshot;
}

export function getServerRightRailFrame(): RightRailFrameResolution {
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

/** The rail's open cost including its `m-2` gutters — one spelling, used by both sides. */
export function contextRailCostPx(openWidthPx = CONTEXT_PANEL_WIDTH_PX): number {
  return openWidthPx + RIGHT_RAIL_GUTTER_PX * 2;
}
