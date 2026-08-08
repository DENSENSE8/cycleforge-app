/**
 * Station Displays visit history — browser-style past / present / future for
 * Root Index ↔ leaf navigation (and host nest snapshots). Nested Inventory /
 * Photos / Units / Linkage drills stay on the breadcrumb trail (`popOne`);
 * this stack records leaf-level frames the trail cannot restore.
 *
 * Pure module — no React. {@link StationDisplaysPushStack} owns the state.
 */

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

/** Record a divergent navigation — clears forward. No-op when equal to present. */
export function pushVisitFrame(
  state: DisplaysVisitHistoryState,
  next: DisplaysVisitFrame,
): DisplaysVisitHistoryState {
  if (visitFramesEqual(state.present, next)) return state;
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
