/** Per-LINE collapse rules for a station line list — pure, no React. */

export interface LineCollapseState {
  /**
   * The active line the pins below were taken under. When the controller moves
   * to a different line, the pins no longer describe the operator's intent, so
   * they are dropped and the default rule takes over again.
   */
  anchor: number | null;
  /** Explicit operator pins, by line id. `true` = expanded. Outranks the rule. */
  pinned: Readonly<Record<number, boolean>>;
  /** Collapse all pressed — every unpinned line is face-only, active included. */
  collapsedAll: boolean;
}

export const LINE_COLLAPSE_INITIAL: LineCollapseState = {
  anchor: null,
  pinned: {},
  collapsedAll: false,
};

export type LineCollapseEvent =
  | { kind: 'toggle'; lineId: number; activeLineId: number | null }
  | { kind: 'expand'; lineId: number; activeLineId: number | null }
  | { kind: 'collapse-all'; activeLineId: number | null };

/** Drop pins taken under a different active line — see the docblock. */
function anchored(state: LineCollapseState, activeLineId: number | null): LineCollapseState {
  if (state.anchor === activeLineId) return state;
  return { ...LINE_COLLAPSE_INITIAL, anchor: activeLineId };
}

/**
 * Is this line showing its capture body?
 *
 * Pin, then Collapse all, then the default rule. Safe to call per row on every
 * render — one object read, no allocation when the anchor still holds.
 */
export function isLineExpanded(
  state: LineCollapseState,
  lineId: number,
  activeLineId: number | null,
): boolean {
  const base = anchored(state, activeLineId);
  const pin = base.pinned[lineId];
  if (pin !== undefined) return pin;
  if (base.collapsedAll) return false;
  return activeLineId != null && lineId === activeLineId;
}

export function lineCollapseReducer(
  state: LineCollapseState,
  event: LineCollapseEvent,
): LineCollapseState {
  const base = anchored(state, event.activeLineId);

  switch (event.kind) {
    case 'toggle': {
      // Pin the OPPOSITE of what is on screen right now, whatever produced it —
      // never a blind `!pinned[id]`, which no-ops the first press on a line the
      // default rule or Collapse all is already deciding.
      const next = !isLineExpanded(base, event.lineId, event.activeLineId);
      return { ...base, pinned: { ...base.pinned, [event.lineId]: next } };
    }

    case 'expand': {
      // Idempotent: selecting / scanning a line asks for its capture bar, and
      // must not toggle a line that already has one.
      if (isLineExpanded(base, event.lineId, event.activeLineId)) return base;
      return { ...base, pinned: { ...base.pinned, [event.lineId]: true } };
    }

    case 'collapse-all':
      // Clears pins on the way: an operator asking for the whole list back does
      // not want one row they opened ten minutes ago exempted from it.
      return { anchor: event.activeLineId, pinned: {}, collapsedAll: true };

    default:
      return state;
  }
}
