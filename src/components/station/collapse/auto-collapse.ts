/**
 * Auto-collapse rules for a station centre's context blocks — pure, no React.
 * for it. No station calls them any more (operator ruling, 2026-08-30): a caret
 */

/** Px of scroll that counts as "the operator scrolled down". */
export const AUTO_COLLAPSE_SCROLL_PX = 24;

export type AutoCollapseEvent =
  | { kind: 'scroll'; scrollTop: number }
  | { kind: 'engage' }
  | { kind: 'disengage' }
  | { kind: 'toggle' }
  | { kind: 'collapse-all' }
  | { kind: 'expand-all' };

export interface AutoCollapseState {
  collapsed: boolean;
  /** The composer holds focus — the strongest "I am writing, not reading" signal. */
  engaged: boolean;
  /** An explicit operator toggle outranks the automatic triggers until released. */
  pinned: boolean;
}

export const AUTO_COLLAPSE_INITIAL: AutoCollapseState = {
  collapsed: false,
  engaged: false,
  pinned: false,
};

export function autoCollapseReducer(
  state: AutoCollapseState,
  event: AutoCollapseEvent,
): AutoCollapseState {
  switch (event.kind) {
    case 'toggle':
      // Deliberate act — remember it, and stop the auto triggers overriding it.
      return { ...state, collapsed: !state.collapsed, pinned: true };

    case 'collapse-all':
      return { ...state, collapsed: true, pinned: true };

    case 'expand-all':
      return { ...state, collapsed: false, pinned: true };

    case 'engage': {
      if (state.pinned) return { ...state, engaged: true };
      return { ...state, engaged: true, collapsed: true };
    }

    case 'disengage':
      // Sticky on purpose: re-expanding here would shove the thread down the
      // page the moment the operator clicks away from the composer.
      return { ...state, engaged: false };

    case 'scroll': {
      const atTop = event.scrollTop <= AUTO_COLLAPSE_SCROLL_PX;
      if (atTop) {
        // The top edge is the one unambiguous "show me the header again", so it
        // also releases a manual pin.
        if (state.engaged) return state;
        return { ...state, collapsed: false, pinned: false };
      }
      if (state.pinned) return state;
      return { ...state, collapsed: true };
    }

    default:
      return state;
  }
}
