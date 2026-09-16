/**
 * `StaffDayReportRow → CompoundRowView` — the staff-day adapter.
 *
 * Pure, strings and enums, no JSX: "the moment a family can pass a node, the
 * fork walks back in wearing a view model." Every fact not named here is a
 * bound SLOT resolved through `report-staff-day-resolve.ts`.
 *
 * ## What the compound row says about one (staffer × task) cell
 *
 * - TITLE — the TASK, because the manager scanning this table is asking "was
 *   this done", and the task is the subject of that question.
 * - IDS — the STAFF name, on the identity face: it is the handle a lead
 *   quotes ("what did Ana do"), and it repeats down a staffer's block of rows
 *   exactly like an order id repeats down its lines.
 * - STATE — `Checked` / `Not checked`, the pill's word. `done` tone on a
 *   checked task (finished / confirmed — the tone's stated meaning), neutral
 *   on an open one: an open task is not an ALERT, it is simply not done yet,
 *   and 'alert' is reserved for "needs a human" (hold, exception, mismatch).
 * - DATES — WHEN it was ticked, on the Hash line, as the clock time: every
 *   row on one report shares a civil day, so the day adds nothing and the
 *   time is the fact ("checked off at this time", operator 2026-09-15).
 *
 * No photo, no money, no carrier, no platform on a checklist row; all stay
 * null and the shared cells paint the honest empty face.
 */

import { format } from 'date-fns';
import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import { compoundIdentityFace } from '@/components/tables/compound/compound-row-model';
import type { StaffDayReportRow } from '@/lib/reports/staff-day-rows';

const CHECKED_LABEL = 'Checked';
const NOT_CHECKED_LABEL = 'Not checked';

/** Clock-time face for the Dates Hash line — the day is the page's, the time is the row's. */
function clockFace(iso: string | null): { label: string; dateKey: string } | null {
  if (!iso) return null;
  const moment = new Date(iso);
  if (Number.isNaN(moment.getTime())) return null;
  return { label: format(moment, 'h:mm a'), dateKey: format(moment, 'yyyy-MM-dd') };
}

export function reportStaffDayCompoundView(row: StaffDayReportRow): CompoundRowView {
  const at = clockFace(row.checkedAt);
  const done = row.checkedAt != null;

  return {
    id: `${row.staffId}-${row.itemId}`,
    thumbUrl: null,
    title: row.title,
    // A task row opens nothing: it IS the record. The phone owns the per-person
    // drill; a link here would duplicate `/m/reports`'s sheet on the desk.
    titleHref: null,
    // Nothing under the title: cadence and ticket are status tracks, and a
    // note repeating them would double a column.
    note: null,
    identityFace: compoundIdentityFace(String(row.ticketId ?? row.itemId), 'ID'),
    orderId: null,
    tracking: null,
    platformValue: null,
    carrier: null,
    stateLabel: done ? CHECKED_LABEL : NOT_CHECKED_LABEL,
    stateTone: (done ? 'done' : 'neutral') satisfies CompoundStateTone,
    stateTip: done ? `Ticked at ${at?.label ?? ''}` : 'Not ticked on this day',
    orderedAt: at
      ? { label: at.label, tip: `Checked ${at.label}`, dateKey: at.dateKey }
      : null,
    ...(at ? { startedHover: `Checked ${at.label}` } : null),
    delay: null,
    amount: null,
  };
}
