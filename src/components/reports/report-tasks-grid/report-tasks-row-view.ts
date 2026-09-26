/**
 * `TaskDeskRow → CompoundRowView` — the completed-tasks report adapter.
 *
 * Pure, strings and enums, no JSX: "the moment a family can pass a node, the
 * fork walks back in wearing a view model." Every fact not named here is a
 * bound SLOT resolved through `report-tasks-resolve.ts`.
 *
 * ## Why this is not `taskDeskCompoundView`
 *
 * The desk adapter answers an OPEN task's question — who owes this, and is it
 * behind — so it paints the handoff on the note line and leaves both DATES
 * lines empty for a finished row (`delay` is null once a task is done, which
 * is correct there: a finished task is not late). Pointed at this report it
 * would paint a whole column of `--` under a live `Completed` header, which is
 * `SLOT_TABLE_PAINT_LAW.headerSort`'s failure case. The two people move to
 * bound tracks here, and the DATES cell carries the two facts the record is
 * read for.
 *
 * ## What the compound row says about one finished task
 *
 * - TITLE — what somebody typed when they threw it, linked to the record it is
 *   about (`taskDeskRecordHref` — the same route the desk and `/m` open, never
 *   a second spelling). A task with no note is named by that record.
 * - IDS — the assignment's own id, and nothing else. A task has two people and
 *   neither may enter column one.
 * - STATE — `Done` or `Canceled`, from `workStatusLabel`. No local map.
 * - DATES — Hash line = WHEN it landed, Calendar line = the day it was promised
 *   for, toned by whether it landed after that day. That comparison is the
 *   report's whole question, and it is measured completion-against-deadline,
 *   never against `now`: a record does not become later while it is read.
 *
 * There is no money, no photo and no carrier on a task row; all three stay null
 * and the shared cells paint the honest empty face.
 */

import { format } from 'date-fns';
import type { CompoundRowView } from '@/components/tables/compound/compound-row-model';
import { compoundIdentityFace } from '@/components/tables/compound/compound-row-model';
import {
  taskDeskRecordHref,
  taskDeskTitle,
  type TaskDeskRow,
} from '@/lib/tasks/task-desk-row';
import { reportTasksRecordText } from '@/lib/tables/field-catalog/report-tasks-resolve';
import { workStatusLabel } from '@/lib/work-orders/work-status-display';

const DAY_MS = 86_400_000;

/** Compact civil face for a DATES line — no year (slot-table date law). */
function civilFace(ms: number | null): { label: string; dateKey: string; clock: string } | null {
  if (ms === null) return null;
  const moment = new Date(ms);
  if (Number.isNaN(moment.getTime())) return null;
  return {
    label: format(moment, 'MMM d'),
    dateKey: format(moment, 'yyyy-MM-dd'),
    clock: format(moment, 'h:mm a'),
  };
}

export function reportTasksCompoundView(row: TaskDeskRow): CompoundRowView {
  const completed = civilFace(row.completedAtMs);
  const deadline = civilFace(row.deadlineAtMs);
  const record = reportTasksRecordText(row);

  /*
   * Whole days between the deadline and the landing. Clamped at zero because
   * finishing four days EARLY is not "-4 late" — early is simply on time, and
   * the cell's vocabulary has one direction.
   */
  const daysLate =
    row.deadlineAtMs !== null && row.completedAtMs !== null
      ? Math.max(0, Math.floor((row.completedAtMs - row.deadlineAtMs) / DAY_MS))
      : 0;

  const landedStamp = completed ? `Completed ${completed.label} · ${completed.clock}` : null;

  return {
    id: String(row.id),
    // A task has no photo. The typed placeholder keeps the track's geometry so
    // this report and every other slot peer line up scanline for scanline.
    thumbUrl: null,
    title: taskDeskTitle(row),
    titleHref: taskDeskRecordHref(row, 'desk'),
    // The record the task was about — omitted when the title already IS that
    // phrase, because a note repeating the line above it is a lie by
    // repetition.
    note: row.note ? record : null,
    // The Id track carries THIS family's handle, not an order: `identityFace`
    // paints it plainly and copyably, without the marketplace brand dot and
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
    // column is Id product-wide).
    identityFace: compoundIdentityFace(row.id, 'Task id'),
    // Deliberately null even for a task about an order: column one on this
    // report is the assignment id, and a second handle beside it would put an
    // order number where the report's own key belongs.
    orderId: null,
    tracking: null,
    platformValue: null,
    carrier: null,
    stateLabel: workStatusLabel(row.status) ?? row.status,
    // Every row here is finished, so tone carries the ONE distinction left:
    // work that landed versus work that was withdrawn. Nothing is `alert` — a
    // record of done work has no row that needs a human, and a grid where
    // every row shouts has no signal left.
    stateTone: row.status === 'DONE' ? 'done' : 'neutral',
    stateTip: record,
    orderedAt: completed
      ? { label: completed.label, tip: landedStamp ?? completed.label, dateKey: completed.dateKey }
      : null,
    // Explicit Hash hover SoT — this family names the chip, so the engine must
    // not prefix "Start date" onto a line that is a completion stamp.
    ...(landedStamp ? { startedHover: landedStamp } : null),
    // Calendar line = the promised day. A task nobody set a deadline on leaves
    // it empty rather than inventing one.
    delay: deadline
      ? {
          days: daysLate,
          overdue: daysLate > 0,
          dateLabel: deadline.label,
          dateKey: deadline.dateKey,
        }
      : null,
    delayTip: deadline
      ? daysLate > 0
        ? `Due ${deadline.label} · landed ${daysLate}d late`
        : `Due ${deadline.label} · landed on time`
      : undefined,
    amount: null,
  };
}
