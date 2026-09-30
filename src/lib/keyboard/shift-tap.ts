/**
 * A lone Shift TAP (owner 2026-09-30: "The shift key must toggle the display
 * for the views"): Shift goes down and comes back up with nothing else in
 * between — no other key, no click (Shift+click extends a text selection),
 * no ⌘ / Ctrl / Alt — within {@link SHIFT_TAP_MAX_MS}. Holding Shift longer
 * is a hold (the saved-view digits reveal), never a tap, so Shift+letter
 * chords, ⌘⇧S and Shift+arrow selection never fire it. Pure: the DOM binding
 * lives in `NavKeyStrip`.
 */

/** Longer than this between Shift down and up is a hold, not a tap. */
export const SHIFT_TAP_MAX_MS = 400;

/** `downAt`: when a clean Shift went down; null once anything else happened. */
export type ShiftTapState = { downAt: number | null };

export const SHIFT_TAP_IDLE: ShiftTapState = { downAt: null };

export type ShiftTapInput =
  | { type: 'keydown'; key: string; repeat: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean; at: number }
  | { type: 'keyup'; key: string; at: number }
  | { type: 'pointerdown' }
  | { type: 'blur' };

/** One event → the next state, and whether it completed a tap. */
export function shiftTapReduce(state: ShiftTapState, input: ShiftTapInput): { state: ShiftTapState; tapped: boolean } {
  if (input.type === 'keydown') {
    if (input.key !== 'Shift') return { state: SHIFT_TAP_IDLE, tapped: false };
    // A repeat keeps the first press's time (a long hold ages out).
    if (input.repeat) return { state, tapped: false };
    if (input.metaKey || input.ctrlKey || input.altKey) return { state: SHIFT_TAP_IDLE, tapped: false };
    return { state: { downAt: input.at }, tapped: false };
  }
  if (input.type === 'keyup' && input.key === 'Shift' && state.downAt !== null) {
    return { state: SHIFT_TAP_IDLE, tapped: input.at - state.downAt <= SHIFT_TAP_MAX_MS };
  }
  if (input.type === 'keyup') return { state, tapped: false };
  return { state: SHIFT_TAP_IDLE, tapped: false };
}
