/** Selection anchor — the one place a range of rows is resolved. */

export type SelectionId = string | number;

export interface SelectionAnchorState<Id extends SelectionId = number> {
  /** Row ids in **display order** — the order on screen, after sorting and filtering. */
  readonly ids: readonly Id[];
  /** Currently checked ids. */
  readonly selected: ReadonlySet<Id>;
  /** The row the operator last acted on, or null before the first gesture. */
  readonly anchorId: Id | null;
}

export interface SelectionAnchorResult<Id extends SelectionId = number> {
  readonly selected: ReadonlySet<Id>;
  /** Where the next extend measures from. */
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

/** Extend from the anchor to `targetId` — shift-click and Shift+↑/↓. */
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

  // Always `changed`, and not by optimism:
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

/** The row `delta` steps from `fromId` in display order — j/k/↑/↓. */
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
