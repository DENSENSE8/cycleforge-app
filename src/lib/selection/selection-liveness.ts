/**
 * Is a table selection currently on screen? — the Escape-precedence signal.
 *
 * ## Why this exists
 *
 * `table-selection.ts` is deliberately store-free: a selection is local to its
 * table and travels as an event, so no page has to own another page's rows.
 * That is still true, and this module does not change it — it publishes ONE
 * boolean's worth of information, never the rows.
 *
 * The boolean is needed because Escape is contested. `useRecordCursorKeyboard`
 * is a CAPTURE-phase ambient owner: when a record-cursor publisher is mounted it
 * claims Escape, `preventDefault` + `stopPropagation`, and closes the record
 * plane. On a desk with rows checked and no panel open, that consumed the key
 * for a no-op while a live selection sat on screen — pressing Escape did
 * visibly nothing. Operator 2026-09-05: clear the selection first.
 *
 * ## The precedence, in order
 *
 * 1. **An open overlay** — a dialog, menu or cell editor owns everything
 *    (`hasOpenOverlay()`; the reference implementation is in
 *    `useRecordCursorKeyboard`'s docblock, and this module is modelled on it).
 * 2. **A live selection** — this module. Innermost *state* the operator can see
 *    and undo, so it unwinds before the plane behind it.
 * 3. **The record cursor** — close the open record.
 *
 * Each layer that yields must return WITHOUT `preventDefault`, or the layer
 * beneath it never runs. That is the one rule this file exists to enforce.
 *
 * ## Read, don't subscribe
 *
 * Same discipline as the overlay stack: handlers read the snapshot inside the
 * event, so publishing never re-renders a host. A grid that re-publishes on
 * every checkbox click would otherwise re-run every ambient keyboard effect.
 */

/** Live selected-row counts, keyed by selection scope. */
const counts = new Map<string, number>();

/**
 * Publish `scope`'s selected-row count.
 *
 * Keyed by scope rather than ref-counted because a scope re-publishes on every
 * change and the LAST value is the truth — a counter would drift the moment two
 * effects for one scope overlapped during a remount.
 */
export function setLiveSelectionCount(scope: string, count: number): void {
  if (count > 0) counts.set(scope, count);
  else counts.delete(scope);
}

/**
 * Drop `scope` entirely — a table unmounting, or leaving select mode.
 *
 * Without this a navigated-away desk leaves a phantom selection behind and
 * Escape stays captured on every surface after it.
 */
export function releaseLiveSelection(scope: string): void {
  counts.delete(scope);
}

/** True while any table has rows checked. */
export function hasLiveTableSelection(): boolean {
  return counts.size > 0;
}

/** Test seam — no production caller should need this. */
export function resetLiveSelectionForTest(): void {
  counts.clear();
}
