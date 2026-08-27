import {
  cyclePeriodStartMs,
  isTodoDone,
  type StaffTodoItem,
} from '@/lib/queries/staff-todos-queries';

/**
 * One Tasks table row — a `staff_todos` record resolved against the clock.
 *
 * A VIEW MODEL, assembled once, never re-derived per cell (kinetic-ledger law
 * 4: views assemble resolved facts). Recurring done-ness and the next reset are
 * both functions of `(anchor, interval, now)`, so they are computed HERE, once
 * per row, with the same `nowMs` the rest of the table saw. A cell that called
 * `Date.now()` for itself would let two columns on one row disagree about what
 * time it is.
 */
export interface StaffTaskRow {
  id: number;
  text: string;
  kind: 'general' | 'recurring';
  station: string;
  done: boolean;
  /** Archived (soft-deleted) rows — the "view everything" lane. */
  archived: boolean;
  /** Recurring only: epoch ms when the current cycle turns over. */
  resetsAtMs: number | null;
  /** Recurring cycle length in ms, or null for a general task. */
  intervalMs: number | null;
  /** Latest check-off (epoch ms), whichever track the kind uses. */
  checkedAtMs: number | null;
  sortOrder: number;
}

export function buildStaffTaskRows(
  items: readonly StaffTodoItem[],
  nowMs: number,
): StaffTaskRow[] {
  return items.map((item) => {
    const archived = item.archived_at_ms != null;
    const recurring = item.kind === 'recurring';
    const resetsAtMs =
      recurring && item.recur_anchor_ms != null && item.recur_interval_ms != null
        ? cyclePeriodStartMs(item.recur_anchor_ms, item.recur_interval_ms, nowMs) +
          item.recur_interval_ms
        : null;
    return {
      id: item.id,
      text: item.text,
      kind: item.kind,
      station: item.station ?? '',
      // An archived row keeps its own check state — it is history, and history
      // that silently reads "open" is a lie about what was archived.
      done: isTodoDone(item, nowMs),
      archived,
      resetsAtMs,
      intervalMs: item.recur_interval_ms,
      checkedAtMs: recurring ? item.last_completed_at_ms : item.completed_at_ms,
      sortOrder: item.sort_order,
    };
  });
}
