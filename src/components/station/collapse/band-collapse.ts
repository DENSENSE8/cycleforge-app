/**
 * Per-BAND collapse rules for a station centre — pure, no React.
 *
 * The third member of this module's family, and it sits BETWEEN the other two:
 *
 *   `auto-collapse`  — does the centre yield its column at all (scroll/engage)
 *   `band-collapse`  — which BAND is open inside that centre        ← here
 *   `line-collapse`  — which LINE inside a band shows its capture body
 *
 * ## Why a pin layer rather than a second boolean
 *
 * {@link autoCollapseReducer} owns one `collapsed` flag for the whole centre,
 * because its triggers are about the centre: the operator scrolled, the operator
 * started writing. That is still the DEFAULT for every band. What this adds is
 * the operator naming ONE band — opening Items out of a fully collapsed stack
 * without dragging Label and Placement open with it.
 *
 * ## Why the pins are anchored to `allCollapsed`
 *
 * A pin describes an intent taken against a particular centre state. When the
 * centre state itself changes — Collapse all, a scroll, the composer taking
 * focus — that intent is spent, and carrying it forward would make one band
 * quietly exempt from a gesture the operator aimed at all of them. So the pins
 * are read only while `allCollapsed` still matches the value they were taken
 * under; otherwise the default rule answers.
 */

export interface BandCollapseState {
  /** The centre-wide `collapsed` value the pins below were taken under. */
  anchor: boolean;
  /** Explicit per-band pins, by band id. `true` = open. */
  pinned: Readonly<Record<string, boolean>>;
}

export const BAND_COLLAPSE_INITIAL: BandCollapseState = {
  anchor: false,
  pinned: {},
};

export type BandCollapseEvent =
  | {
      kind: 'toggle' | 'open' | 'close';
      bandId: string;
      /** The centre-wide collapse flag at the moment of the press. */
      allCollapsed: boolean;
    }
  | {
      /**
       * Expand all — drop every pin so the centre-open default applies.
       * Label is seeded shut on Unbox / Testing; Expand all must still open it.
       */
      kind: 'expand-all';
      allCollapsed: boolean;
    };

/** Is this band showing its body? */
export function isBandOpen(
  state: BandCollapseState,
  bandId: string,
  allCollapsed: boolean,
): boolean {
  if (state.anchor !== allCollapsed) return !allCollapsed;
  return state.pinned[bandId] ?? !allCollapsed;
}

export function bandCollapseReducer(
  state: BandCollapseState,
  event: BandCollapseEvent,
): BandCollapseState {
  if (event.kind === 'expand-all') {
    return { anchor: event.allCollapsed, pinned: {} };
  }

  const base =
    state.anchor === event.allCollapsed
      ? state
      : { anchor: event.allCollapsed, pinned: {} };

  const current = isBandOpen(base, event.bandId, event.allCollapsed);
  const next =
    event.kind === 'open' ? true : event.kind === 'close' ? false : !current;
  if (current === next) return base;
  return { anchor: event.allCollapsed, pinned: { ...base.pinned, [event.bandId]: next } };
}
