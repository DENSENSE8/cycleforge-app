/**
 * Daily checklist row → {@link CompoundRowView}. Pure; no React, no hooks.
 *
 * The fifth family adapter into the single compound renderer, and the second
 * checklist (Tasks is the other). It contributes a mapper and a column array,
 * and never a cell.
 *
 * Daily and Tasks look alike and are not the same question, which is exactly
 * the kind of difference this layout is supposed to let through as DATA:
 * `staff_todos` is one staffer's own list, `daily_check_items` is the ORG's
 * shift checklist with a roster behind every row. So the note line here carries
 * the roster denominator rather than a station — see below.
 */

import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import { workStatusLabel } from '@/lib/work-orders/work-status-display';
import type { DailyTaskRow } from './daily-task-row';

/**
 * Lifecycle → the three-tone vocabulary.
 *
 * Nothing here is `alert`. An unchecked shift item is the normal state of the
 * morning; painting a hundred of them loud would leave no signal for the row
 * that genuinely needs a human.
 */
function dailyStateTone(row: DailyTaskRow): CompoundStateTone {
  return row.done ? 'done' : 'neutral';
}

/**
 * How the SHIFT is doing on this item — `3/5`.
 *
 * The one fact a checklist row cannot answer about itself. Whether *I* did it
 * is the state pill; whether the shift did it is a different question, and on
 * the flat model it had its own `team` track. The compound row has five tracks
 * and none of them is "team", so it rides the note line — the slot reserved for
 * the qualifier an operator needs under a title.
 *
 * Empty roster reads as `null`, not `0/0`: a day with nobody rostered has no
 * denominator to report, and a fraction over zero is a worse answer than none.
 */
function teamNote(row: DailyTaskRow): string | null {
  if (row.teamTotal <= 0) return null;
  return `${row.teamDone}/${row.teamTotal} done`;
}

export interface DailyCompoundParts {
  /** Resolved "you checked this off …" line, when the viewer has. */
  markedTip?: string;
}

export function dailyTaskCompoundView(
  row: DailyTaskRow,
  parts: DailyCompoundParts = {},
): CompoundRowView {
  return {
    id: String(row.id),
    // A shift checklist item is not a thing with a photo. The typed placeholder
    // holds the track so Daily lines up scanline for scanline with Unbox.
    thumbUrl: null,
    title: row.title,
    note: teamNote(row),
    // A checklist item has no order and no carrier. Honest nulls — the ids
    // track reads as two dashes, which is a DATA difference and the only kind
    // of difference between two of these tables there is meant to be.
    orderId: null,
    tracking: null,
    platformValue: null,
    carrier: null,
    stateLabel:
      workStatusLabel(row.done ? 'DONE' : 'OPEN') ?? (row.done ? 'Done' : 'Open'),
    stateTone: dailyStateTone(row),
    stateTip: parts.markedTip,
    // A checklist item is not worth money. An empty cell, never a `$0.00`.
    amount: null,
    // A daily item resets with the shift rather than running late — it has a
    // period, not a deadline. `null` renders the on-time face rather than
    // inventing a number nobody triages on.
    delay: null,
  };
}
