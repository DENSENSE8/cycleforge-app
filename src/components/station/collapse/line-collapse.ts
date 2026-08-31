/**
 * Per-LINE collapse rules for a station line list — pure, no React.
 *
 * The sibling of {@link autoCollapseReducer}, one altitude down. That one
 * decides whether a BAND (Items · Label · Placement) yields the column; this
 * one decides whether a single line inside the Items band shows its capture
 * body or only its identity face. They live in the same module for the reason
 * the band rules do: the failure modes are about ORDER and INTENT, and neither
 * is observable in JSX.
 *
 * ## The default rule
 *
 * A line is expanded when it is the one the operator is working — the
 * controller-active line — and collapsed otherwise. Nothing is stored for that;
 * it falls out of `activeLineId`. State exists only for the two things that
 * OUTRANK the rule:
 *
 * - **A pin.** An explicit toggle on one line's face. It survives until the
 *   operator moves to another line.
 * - **Collapse all.** The Items band's gesture. It collapses the active line
 *   too — "give me the list" means the list, not the list plus the one row
 *   that happens to be selected.
 *
 * ## Why pins are anchored
 *
 * Selecting a different line is an unambiguous "I am working this one now", so
 * the pins taken under the previous line are dropped rather than carried
 * forward. Without the anchor, a line the operator collapsed by hand three
 * cartons ago stays collapsed when a scan lands on it — the capture bar the
 * scan needs is simply absent, and nothing on screen says why.
 *
 * **No animation anywhere.** A collapsed line UNMOUNTS its body (operator rule,
 * 2026-08-22; AGENTS.md → "No layout animations"). A collapse that tweens its
 * height still occupies the space for the length of the tween, which is
 * backwards for a gesture whose only purpose is to hand space back.
 */

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
