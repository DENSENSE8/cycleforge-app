/**
 * Auto-collapse rules for a station centre's context blocks — pure, no React.
 *
 * The centre opens with its reference blocks (Items · Status &amp; Timeline)
 * EXPANDED, then yields that vertical space to the conversation the moment the
 * operator signals they are done reading it. Two signals, per the surface spec:
 *
 *   1. they scroll down
 *   2. they focus the notes composer
 *
 * The rules live here rather than inline in the view because the failure modes
 * are all about ORDER and INTENT, and neither is observable in JSX:
 *
 * - **A manual toggle outranks both triggers.** An operator who deliberately
 *   re-opened Status while typing must not have it slammed shut by the next
 *   scroll event. The pin is released only by returning to the top, which is an
 *   unambiguous "show me the header again".
 * - **Blur does NOT re-expand.** Yanking two blocks back into the flow the
 *   instant someone clicks out of the composer would shove the thread they are
 *   reading down the page. Collapse is sticky; only the top edge restores it.
 * - **Scrolling back to the top re-expands** — but only when the composer is
 *   not focused, so a composer that grew tall enough to bounce the scrollport
 *   cannot flip the blocks open under the operator's hands.
 */

/** Px of scroll that counts as "the operator scrolled down". */
export const AUTO_COLLAPSE_SCROLL_PX = 24;

export type AutoCollapseEvent =
  | { kind: 'scroll'; scrollTop: number }
  | { kind: 'engage' }
  | { kind: 'disengage' }
  | { kind: 'toggle' };

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
