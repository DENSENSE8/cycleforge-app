/**
 * Station Displays visit history — Root Index ↔ leaf only (plus host nest
 * snapshots). Nested Inventory / Photos / Units / Linkage drills stay on the
 * breadcrumb trail (`popOne`); this stack does **not** accumulate leaf→leaf
 * hops (cockpit auto-swap Photos→Units must not make Back say "Photos").
 *
 * Pure module — no React. {@link StationDisplaysPushStack} owns the state.
 */

import { STATION_DISPLAY_INDEX } from './display-index';

export type DisplaysVisitFrame = {
  /** `index` or a leaf tab id */
  tab: string;
  /**
   * Opaque nest — host-defined keys (`photoAction`, `linkageAction`,
   * `unitsAction`, `ticketAction`, `claimMode`). Inventory sub-leaves are
   * breadcrumb depth, not nest keys.
   */
  nest?: Readonly<Record<string, string>>;
};

export type DisplaysVisitHistoryState = {
  past: readonly DisplaysVisitFrame[];
  present: DisplaysVisitFrame;
  future: readonly DisplaysVisitFrame[];
};

export function visitFrameKey(frame: DisplaysVisitFrame): string {
  const nest = frame.nest;
  if (!nest || Object.keys(nest).length === 0) return frame.tab;
  const nestPart = Object.keys(nest)
    .sort()
    .map((k) => `${k}=${nest[k]}`)
    .join('&');
  return `${frame.tab}?${nestPart}`;
}

export function visitFramesEqual(a: DisplaysVisitFrame, b: DisplaysVisitFrame): boolean {
  return visitFrameKey(a) === visitFrameKey(b);
}

export function createVisitHistory(present: DisplaysVisitFrame): DisplaysVisitHistoryState {
  return { past: [], present, future: [] };
}

function isIndexTab(tab: string): boolean {
  return tab === STATION_DISPLAY_INDEX;
}

/**
 * Record a divergent navigation — clears forward. No-op when equal to present.
 *
 * **Same-tab nest-only updates replace `present` in place** (do not grow
 * `past`). In-leaf drills (Photos `photoAction`, Linkage / Units / Ticket nest,
 * Inventory sub-leaves) are owned by the breadcrumb trail + `nestedForward`.
 *
 * **Leaf → leaf also replaces `present`** (do not stack the prior leaf). Visit
 * history is Index ↔ leaf; cockpit step swaps and topic jumps must not leave
 * "Back to Photos" on Units. Index ↔ leaf still pushes.
 */
export function pushVisitFrame(
  state: DisplaysVisitHistoryState,
  next: DisplaysVisitFrame,
): DisplaysVisitHistoryState {
  if (visitFramesEqual(state.present, next)) return state;
  if (state.present.tab === next.tab) {
    return { ...state, present: next, future: [] };
  }
  // Leaf → leaf: swap the active leaf; keep Index (if any) as the sole Back target.
  if (!isIndexTab(state.present.tab) && !isIndexTab(next.tab)) {
    return { ...state, present: next, future: [] };
  }
  return {
    past: [...state.past, state.present],
    present: next,
    future: [],
  };
}

export function goVisitBack(
  state: DisplaysVisitHistoryState,
): DisplaysVisitHistoryState | null {
  if (state.past.length === 0) return null;
  const previous = state.past[state.past.length - 1]!;
  return {
    past: state.past.slice(0, -1),
    present: previous,
    future: [state.present, ...state.future],
  };
}

export function goVisitForward(
  state: DisplaysVisitHistoryState,
): DisplaysVisitHistoryState | null {
  if (state.future.length === 0) return null;
  const next = state.future[0]!;
  return {
    past: [...state.past, state.present],
    present: next,
    future: state.future.slice(1),
  };
}

export function canVisitBack(state: DisplaysVisitHistoryState): boolean {
  return state.past.length > 0;
}

export function canVisitForward(state: DisplaysVisitHistoryState): boolean {
  return state.future.length > 0;
}
