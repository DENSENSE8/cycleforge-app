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
import { compoundIdentityFace } from '@/components/tables/compound/compound-row-model';

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

/**
 * The note line, composed — never replaced. A `once` item leads with its
 * marker ("Today only · 1/1 done"); a recurring item paints exactly what it
 * painted before. Only the exception is marked, and the cadence word lives in
 * the NOTE, not on the state pill: the pill answers "did I do it", and a
 * second meaning on one control is the error banned on the select gutter and
 * the station mode row.
 */
function composedNote(row: DailyTaskRow): string | null {
  const team = teamNote(row);
  if (row.kind !== 'once') return team;
  return team ? `Today only · ${team}` : 'Today only';
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
    // The one family whose row IS a check: my tick strikes the title
    // (animated, ease-in-out both ways — operator ruling 2026-09-14). Read
    // off MY mark, never the roster's: `row.done` is the viewer's own.
    titleStruck: row.done,
    note: composedNote(row),
    // The IDENTITY track carries the checklist handle — the
    // `daily_check_items.id` a lead quotes to another staffer (operator
    // 2026-09-14: "the slot data table displays as id and not order"). It is
    // NOT an order: `identityFace` paints it plainly and copyably, without the
    // marketplace dot and open-on-platform menu `orderId` would bring.
    identityFace: compoundIdentityFace(row.id, 'Checklist item id'),
    // No order and no carrier — honest nulls. The tracking line reads as one
    // dash, which is a DATA difference and the only kind there is meant to be.
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
