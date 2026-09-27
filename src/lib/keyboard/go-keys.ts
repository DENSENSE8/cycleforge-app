/**
 * `G` then a letter — "go to a place" (Linear / GitHub / Gmail). Tap `G`,
 * release, tap the destination's letter within {@link GO_TIMEOUT_MS}. The
 * pure machine lives here; the DOM binding and the teaching HUD live in
 * `NavGoKeys` (the sidebar owns desktop navigation).
 *
 * Never inside a text field, never with ⌘ / Ctrl / Alt, never from a key
 * repeat, and never from a scanner burst (keys closer than
 * {@link GO_SCAN_BURST_MS} are a wedge typing, not a person).
 */

/** How long `G` stays armed waiting for its letter. */
export const GO_TIMEOUT_MS = 1500;
/** Below this inter-key gap a burst is a scanner, not a human. */
export const GO_SCAN_BURST_MS = 30;

export type GoState = { phase: 'idle' } | { phase: 'armed'; at: number };

export const GO_IDLE: GoState = { phase: 'idle' };

export type GoKeyInput = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  /** Focus is in a text input / textarea / contenteditable. */
  editable: boolean;
  /** Event time, ms. */
  at: number;
  /** Time of the previous keydown, ms (for the scanner-burst guard). */
  previousAt: number;
};

export type GoAction = { type: 'none' } | { type: 'arm' } | { type: 'go'; letter: string } | { type: 'cancel' };

export type GoStep = {
  state: GoState;
  action: GoAction;
  /** The binding should preventDefault + stopPropagation. */
  consumed: boolean;
};

const NONE: GoAction = { type: 'none' };

function cancel(state: GoState, consumed: boolean): GoStep {
  return state.phase === 'armed'
    ? { state: GO_IDLE, action: { type: 'cancel' }, consumed }
    : { state, action: NONE, consumed: false };
}

/**
 * One keydown. `known(letter)` says whether a destination answers that
 * letter; an unknown letter disarms and passes the key through untouched.
 */
export function goReduce(state: GoState, input: GoKeyInput, known: (letter: string) => boolean): GoStep {
  const current: GoState = state.phase === 'armed' && input.at - state.at > GO_TIMEOUT_MS ? GO_IDLE : state;
  if (input.repeat) return { state: current, action: NONE, consumed: false };
  if (input.metaKey || input.ctrlKey || input.altKey || input.editable) return cancel(current, false);
  if (input.at - input.previousAt < GO_SCAN_BURST_MS) return cancel(current, false);

  const key = input.key.length === 1 ? input.key.toLowerCase() : input.key;
  if (current.phase === 'idle') {
    if (key === 'g' && !input.shiftKey) return { state: { phase: 'armed', at: input.at }, action: { type: 'arm' }, consumed: true };
    return { state: current, action: NONE, consumed: false };
  }
  if (key === 'Escape') return cancel(current, true);
  if (key === 'Shift') return { state: current, action: NONE, consumed: false };
  if (!input.shiftKey && /^[a-z]$/.test(key) && known(key)) {
    return { state: GO_IDLE, action: { type: 'go', letter: key }, consumed: true };
  }
  return cancel(current, false);
}
