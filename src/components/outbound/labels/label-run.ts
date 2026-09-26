/**
 * Label-run stepper — the pure half of the To-ship inline Labels mode
 * (operator ruling R-FLOW-6, 2026-09-01).
 */

export interface LabelRunState {
  /** Selected order ids in display (top-to-bottom) order, fixed at start. */
  readonly queue: readonly number[];
  /** The id whose row carries the active-work highlight + expansion band. */
  readonly activeId: number;
}

/**
 * Start a run over the selection, first selected row active.
 * `null` when the selection is empty — there is nothing to walk.
 */
export function startLabelRun(
  selectedIdsInDisplayOrder: readonly number[],
): LabelRunState | null {
  const queue = selectedIdsInDisplayOrder.filter(
    (id, index) => Number.isFinite(id) && selectedIdsInDisplayOrder.indexOf(id) === index,
  );
  if (queue.length === 0) return null;
  return { queue, activeId: queue[0] };
}

/**
 * Advance past the active row (a successful buy, or an explicit Skip / Next).
 * `null` when the active row was the last — the run is finished and label
 * mode exits.
 */
export function advanceLabelRun(run: LabelRunState): LabelRunState | null {
  const index = run.queue.indexOf(run.activeId);
  // Active id no longer in the queue (pruned concurrently): resume from the
  // start of what remains rather than throwing the operator out mid-run.
  const nextIndex = index === -1 ? 0 : index + 1;
  if (nextIndex >= run.queue.length) return null;
  return { queue: run.queue, activeId: run.queue[nextIndex] };
}

/** Reconcile the run against the rows the table can still show. */
export function pruneLabelRun(
  run: LabelRunState,
  presentIds: ReadonlySet<number>,
): LabelRunState | null {
  const queue = run.queue.filter((id) => presentIds.has(id));
  if (queue.length === 0) return null;
  if (queue.includes(run.activeId)) {
    // Same walk, possibly shorter queue.
    if (queue.length === run.queue.length) return run;
    return { queue, activeId: run.activeId };
  }
  // The active row vanished: the next survivor AFTER its old position keeps
  // the walk moving down the list; past the end means the run is done.
  const oldIndex = run.queue.indexOf(run.activeId);
  const successor = run.queue
    .slice(oldIndex + 1)
    .find((id) => presentIds.has(id));
  if (successor === undefined) return null;
  return { queue, activeId: successor };
}

/** 1-based position of the active row, for the band's "k of n" caption. */
export function labelRunPosition(run: LabelRunState): {
  index: number;
  total: number;
} {
  const index = run.queue.indexOf(run.activeId);
  return { index: index === -1 ? 1 : index + 1, total: run.queue.length };
}
