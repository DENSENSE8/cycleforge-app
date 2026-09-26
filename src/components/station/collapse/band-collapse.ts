/** Per-BAND collapse rules for a station centre — pure, no React. */

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
