/**
 * Staff task row → {@link CompoundRowView}. Pure; no React, no hooks.
 *
 * The fourth family adapter into the single compound renderer, and the one
 * that proves the seam is a seam: a `staff_todos` row shares nothing with a
 * receiving line except that both are things an operator works through. It
 * still contributes a mapper and a column array, and never a cell.
 *
 * Where a task has no equivalent fact the mapping says so with `null` rather
 * than inventing one. An empty `fulfillment` track renders two dashes, which
 * is the honest answer to "what order is this task on" — a personal to-do has
 * none. That difference is DATA; the layout around it is identical to every
 * other table's, which is the whole point.
 */

import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import { STATION_LABEL, type StationKey } from '@/components/layout/goal-chip/goal-chip-shared';
import { workStatusLabel } from '@/lib/work-orders/work-status-display';
import type { StaffTaskRow } from './staff-task-row';

/** Whole days between now and a deadline; negative when still ahead of it. */
function daysPast(deadlineMs: number, nowMs: number): number {
  return Math.floor((nowMs - deadlineMs) / 86_400_000);
}

/**
 * Lifecycle → the compound row's three-tone vocabulary.
 *
 * Deleted outranks done, for the same reason the flat Status cell ranked them
 * that way: an archived row keeps its own check state, but what an operator
 * needs to read first is that it is not on the list any more.
 *
 * Nothing here is `alert`. A personal to-do that is merely open does not need a
 * human the way a held carton does, and a grid where every unchecked row shouts
 * has no signal left for the row that genuinely does.
 */
function taskStateTone(row: StaffTaskRow): CompoundStateTone {
  if (row.archived) return 'neutral';
  return row.done ? 'done' : 'neutral';
}

export interface StaffTaskCompoundParts {
  /** The SAME clock the rest of the table read — never `Date.now()` per row. */
  nowMs: number;
}

export function staffTaskCompoundView(
  row: StaffTaskRow,
  parts: StaffTaskCompoundParts,
): CompoundRowView {
  const station = row.station
    ? (STATION_LABEL[row.station as StationKey] ?? row.station)
    : null;
  // Recurring tasks are the only ones with a deadline, and it is a CYCLE reset
  // rather than a due date. Past its reset means the cycle turned over with the
  // task unchecked — which is exactly the "is this behind, and by how much"
  // question the compound row's second status line exists to answer.
  const overdueBy =
    row.resetsAtMs != null && !row.done && !row.archived
      ? daysPast(row.resetsAtMs, parts.nowMs)
      : null;

  return {
    id: String(row.id),
    // A task has no photo. The typed placeholder keeps the track's geometry so
    // Tasks and Unbox still line up scanline for scanline.
    thumbUrl: null,
    title: row.text,
    // The station is the task's QUALIFIER — the thing that says which list this
    // belongs to — so it takes the line a warehouse row gives to its note.
    // `staff_todos` has no note column, which is also why no `onCommitNote` is
    // wired: read-only-ness is the ABSENCE of the capability, never a second
    // cell with the editor removed.
    note: station,
    // A personal to-do has no order and no carrier. Honest nulls.
    orderId: null,
    tracking: null,
    platformValue: null,
    carrier: null,
    // `workStatusLabel` returns null for a status it does not know; DONE / OPEN
    // are both in its table, so the fallback is defensive rather than reachable.
    stateLabel: row.archived
      ? 'Deleted'
      : (workStatusLabel(row.done ? 'DONE' : 'OPEN') ?? (row.done ? 'Done' : 'Open')),
    stateTone: taskStateTone(row),
    stateTip: row.archived
      ? 'Deleted — restore it from the inspector'
      : row.done
        ? 'Checked off'
        : row.kind === 'recurring'
          ? 'Not checked off this cycle'
          : 'Not checked off',
    delay: overdueBy == null ? null : { days: overdueBy, overdue: overdueBy > 0 },
    delayTip:
      row.resetsAtMs != null
        ? `Cycle resets ${new Date(row.resetsAtMs).toLocaleString()}`
        : undefined,
  };
}
