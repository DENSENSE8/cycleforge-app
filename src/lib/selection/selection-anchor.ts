/**
 * Selection anchor — the one place a range of rows is resolved.
 *
 * Shift-click and Shift+↑/↓ are **the same gesture with two input devices**:
 * both mean "take the span from the row I last acted on to the row I am
 * pointing at, and make it agree with the row I am pointing at". The row-model
 * plan says to write that once
 * (`docs/todo/seller-table-program-PLAN.md` §11, Row model owes) and this is it.
 *
 * ## Why it left `useTableSelectMode`
 *
 * The range walk used to live inline inside that hook's `toggle`, reachable
 * only through a pointer event, so:
 *
 *   * the keyboard could not extend a selection at all — there was no seam to
 *     call, and a second copy of the walk is how the two would have drifted;
 *   * it could not be tested without mounting React, so the one rule that
 *     matters (which STATE the span takes) was pinned by nothing.
 *
 * Pure and dependency-free on purpose — same contract as
 * `right-rail/selection-occupancy.ts`: no React, no DOM, no imports, so it runs
 * under `node --test` with zero setup.
 *
 * ## The rule the span follows
 *
 * **The span takes the TARGET row's new state, not the anchor's.** Shift-click
 * a checked row inside a checked block and the block clears; shift-click an
 * unchecked row and the block fills. That is the spreadsheet behaviour every
 * operator already has in their hands, and it is why `extendTo` computes
 * `checked` from the target before it walks — deriving it from the anchor
 * instead would make a range-deselect impossible to express.
 *
 * ## Identity stability is part of the contract
 *
 * Every result reports `changed`. The callers park these sets in React state
 * and broadcast them on the selection bus, so returning a fresh `Set` for a
 * gesture that altered nothing would re-render the grid and re-emit the same
 * selection — the ping-pong `useTableSelectMode`'s own docblock warns about.
 * When `changed` is false the caller keeps the set it already had.
 */

export type SelectionId = string | number;

export interface SelectionAnchorState<Id extends SelectionId = number> {
  /**
   * Row ids in **display order** — the order on screen, after sorting and
   * filtering.
   *
   * Not the underlying collection: a span is what the operator sees between
   * two rows, so a resolver reading source order would select rows that are
   * not between them, and on a sorted view would select rows not on screen.
   */
  readonly ids: readonly Id[];
  /** Currently checked ids. */
  readonly selected: ReadonlySet<Id>;
  /** The row the operator last acted on, or null before the first gesture. */
  readonly anchorId: Id | null;
}

export interface SelectionAnchorResult<Id extends SelectionId = number> {
  readonly selected: ReadonlySet<Id>;
  /**
   * Where the next extend measures from.
   *
   * It follows the target on every gesture, including an extend — so a second
   * Shift+↓ grows the span by one row rather than re-measuring from the
   * original anchor and re-selecting what is already selected.
   */
  readonly anchorId: Id | null;
  /** False when the gesture altered nothing — the caller keeps its own set. */
  readonly changed: boolean;
}

function unchanged<Id extends SelectionId>(state: SelectionAnchorState<Id>, anchorId: Id | null): SelectionAnchorResult<Id> {
  return { selected: state.selected, anchorId, changed: false };
}

/** Plain toggle — a click, `x`, or Space on one row. Moves the anchor. */
export function toggleAt<Id extends SelectionId>(
  state: SelectionAnchorState<Id>,
  targetId: Id,
): SelectionAnchorResult<Id> {
  const next = new Set(state.selected);
  if (next.has(targetId)) next.delete(targetId);
  else next.add(targetId);
  return { selected: next, anchorId: targetId, changed: true };
}

/**
 * Extend from the anchor to `targetId` — shift-click and Shift+↑/↓.
 *
 * Falls back to a plain toggle when there is nothing to measure from: no
 * anchor yet, the anchor is the target, or either id has left the view (a
 * filter narrowed under the operator between the two clicks). Falling back is
 * what keeps a shift-click from being a silent no-op on the gesture an
 * operator most expects to work.
 */
export function extendTo<Id extends SelectionId>(
  state: SelectionAnchorState<Id>,
  targetId: Id,
): SelectionAnchorResult<Id> {
  const { ids, selected, anchorId } = state;
  if (anchorId == null || anchorId === targetId) return toggleAt(state, targetId);

  const anchorPos = ids.indexOf(anchorId);
  const targetPos = ids.indexOf(targetId);
  if (anchorPos < 0 || targetPos < 0) return toggleAt(state, targetId);

  const [lo, hi] = anchorPos <= targetPos ? [anchorPos, targetPos] : [targetPos, anchorPos];
  // The span agrees with the TARGET's new state — see the docblock.
  const checked = !selected.has(targetId);

  const next = new Set(selected);
  for (let i = lo; i <= hi; i += 1) {
    const id = ids[i]!;
    if (checked) next.add(id);
    else next.delete(id);
  }

  // Always `changed`, and not by optimism: the target sits at one end of its
  // own span and `checked` is its inverse, so the walk always flips at least
  // that row. There is no no-op extend to guard for — a `changed` counter here
  // would be a branch no input can reach.
  return { selected: next, anchorId: targetId, changed: true };
}

/** Replace the whole set with exactly this row — a row-body click on a rail surface. */
export function selectOnlyAt<Id extends SelectionId>(
  state: SelectionAnchorState<Id>,
  targetId: Id,
): SelectionAnchorResult<Id> {
  const sole = state.selected.size === 1 && state.selected.has(targetId);
  if (sole) return unchanged(state, targetId);
  return { selected: new Set([targetId]), anchorId: targetId, changed: true };
}

/** Check every row in the view — ⌘A. */
export function selectAll<Id extends SelectionId>(state: SelectionAnchorState<Id>): SelectionAnchorResult<Id> {
  const { ids, selected, anchorId } = state;
  if (ids.length === selected.size && ids.every((id) => selected.has(id))) {
    return unchanged(state, anchorId);
  }
  return { selected: new Set(ids), anchorId, changed: true };
}

/** Check or uncheck a named set of rows without replacing the rest of the set. */
export function setMany<Id extends SelectionId>(
  state: SelectionAnchorState<Id>,
  ids: readonly Id[],
  checked: boolean,
): SelectionAnchorResult<Id> {
  if (ids.length === 0) return unchanged(state, state.anchorId);
  const next = new Set(state.selected);
  let changed = false;
  for (const id of ids) {
    if (checked) {
      if (!next.has(id)) {
        next.add(id);
        changed = true;
      }
    } else if (next.delete(id)) {
      changed = true;
    }
  }
  if (!changed) return unchanged(state, state.anchorId);
  return { selected: next, anchorId: ids[ids.length - 1]!, changed: true };
}

/** Drop every checked row — Esc with the form closed, or the bar's Clear. */
export function clearSelection<Id extends SelectionId>(state: SelectionAnchorState<Id>): SelectionAnchorResult<Id> {
  if (state.selected.size === 0) return unchanged(state, null);
  return { selected: new Set(), anchorId: null, changed: true };
}

/**
 * The row `delta` steps from `fromId` in display order — j/k/↑/↓.
 *
 * **Clamps; it does not wrap.** An operator holding ↓ through a 900-row queue
 * must stop at the bottom, not reappear at the top having lost their place.
 * With no cursor yet, the first step lands on the first row for a forward step
 * and the last row for a backward one, so `k` from cold opens at the end of the
 * list the way `G` does.
 */
export function stepCursor(
  ids: readonly number[],
  fromId: number | null,
  delta: number,
): number | null {
  if (ids.length === 0) return null;
  if (fromId == null) return delta >= 0 ? ids[0]! : ids[ids.length - 1]!;
  const pos = ids.indexOf(fromId);
  if (pos < 0) return delta >= 0 ? ids[0]! : ids[ids.length - 1]!;
  const next = Math.min(ids.length - 1, Math.max(0, pos + delta));
  return ids[next]!;
}
