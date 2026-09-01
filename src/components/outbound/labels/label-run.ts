/**
 * Label-run stepper — the pure half of the To-ship inline Labels mode
 * (operator ruling R-FLOW-6, 2026-09-01).
 *
 * The operator selects rows, invokes the **Labels** selection verb, and works
 * the queue one row at a time: the shipping panel expands beneath the ACTIVE
 * row, each buy commits per row on the server (K10 — no batch state to lose),
 * and the run advances to the next selected row. This module owns only the
 * arithmetic of that walk — which id is active, what comes next, what happens
 * when a row vanishes out from under the run — so the unit gate covers it
 * without a DOM.
 *
 * The queue is captured ONCE, in display order, when the verb is invoked.
 * Later selection changes do not grow a running queue: a run is a commitment
 * to the rows the operator picked, not a live view of the checkbox column.
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

/**
 * Reconcile the run against the rows the table can still show.
 *
 * A refetch can drop a row mid-run (shipped elsewhere, filtered out by a
 * concurrent edit). Missing ids leave the queue; if the ACTIVE row is the one
 * that vanished, the run moves to the next surviving id after its old
 * position (not back to the top). `null` when nothing survives.
 */
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
