/**
 * Daily slot resolvers — agenda row + fieldId → the resolved fact a slot cell
 * paints. Pure functions; no React, no hooks.
 *
 * Vocabulary is never declared here: the done/open face and the assignment
 * lifecycle both resolve through `workStatusLabel` (the SoT the compound state
 * pill reads), and the type word through `DAILY_AGENDA_TYPE_LABEL` (the SoT
 * the band caption reads). A string literal here would be a second spelling of
 * a word another surface already owns.
 *
 * ## The union rule
 *
 * A fact the row's half does not carry resolves `{ kind: 'value', text: null }`
 * and the cell dashes. It NEVER borrows the other half's fact — a task with no
 * roster must not report a team fraction, and a checklist item with no
 * deadline must not report one.
 */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import { DAILY_AGENDA_TYPE_LABEL, type DailyAgendaRow } from '@/lib/daily/daily-agenda-row';
import { workStatusLabel } from '@/lib/work-orders/work-status-display';
import { formatDateKeyShort } from '@/utils/date';

/** Epoch ms → the civil-day face every other date slot paints. */
function dayText(ms: number | null): string | null {
  return ms == null ? null : formatDateKeyShort(new Date(ms).toISOString().slice(0, 10));
}

/**
 * How the SHIFT is doing on this item — `3/5`.
 *
 * An empty roster reads as `null`, not `0/0`: a day with nobody rostered has no
 * denominator to report, and a fraction over zero is a worse answer than none.
 * A task carries no roster at all, so both halves of the fraction are null and
 * the same `null` comes back — one rule, not a type branch.
 */
function teamText(row: DailyAgendaRow): string | null {
  if (row.teamTotal == null || row.teamTotal <= 0) return null;
  return `${row.teamDone ?? 0}/${row.teamTotal}`;
}

/**
 * The lifecycle word.
 *
 * A task reports its own `assignment_status_enum`; a checklist row has no
 * lifecycle, only the viewer's tick, so `done` maps onto the same two words
 * the pill has always painted.
 */
function statusText(row: DailyAgendaRow): string {
  if (row.status != null) return workStatusLabel(row.status) ?? row.status;
  return workStatusLabel(row.done ? 'DONE' : 'OPEN') ?? (row.done ? 'Done' : 'Open');
}

/**
 * Resolve one bound field for one row. Unknown field id → null (the cell
 * dashes); the layout resolver has already dropped stale bindings.
 */
export function resolveDailySlotValue(
  row: DailyAgendaRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'daily.item':
      return { kind: 'value', text: `#${row.id}` };
    case 'daily.title':
      return { kind: 'value', text: row.title };
    case 'daily.type':
      return { kind: 'value', text: DAILY_AGENDA_TYPE_LABEL[row.type] };
    case 'daily.status':
      return { kind: 'value', text: statusText(row) };
    case 'daily.team':
      return { kind: 'value', text: teamText(row) };
    case 'daily.marked':
      return { kind: 'value', text: dayText(row.markedAtMs) };
    case 'daily.kind':
      // Only the exception is marked: a bound Kind column dashes on recurring
      // rows — and on every task, which has no cadence at all — rather than
      // painting a word on a hundred unremarkable ones.
      return { kind: 'value', text: row.cadence === 'once' ? 'Once' : null };
    case 'daily.owner':
      return { kind: 'person', staffId: row.ownerId, name: row.ownerName };
    case 'daily.assignedBy':
      // Null on every checklist row and on every assignment written before
      // `assigned_by_staff_id` existed — an honest dash. The union row carries
      // the NAME only, so there is no staff id to hand a StaffAvatar.
      return { kind: 'person', staffId: null, name: row.assignedByName };
    case 'daily.priority':
      return {
        kind: 'value',
        text: row.urgency == null ? null : row.urgency === 'urgent' ? 'Urgent' : 'Normal',
      };
    case 'daily.deadline':
      return { kind: 'value', text: dayText(row.deadlineAtMs) };
    case 'daily.completed':
      return { kind: 'value', text: dayText(row.completedAtMs) };
    case 'daily.record':
      return { kind: 'value', text: row.recordLabel };
    default:
      return null;
  }
}

/**
 * Every bound slot for one row, keyed by TRACK key — the `slots` half of the
 * shared `CompoundRowView`. Built from the MOUNTED model so a rebind re-points
 * the cell with no change here.
 */
export function dailySlotValuesFor(
  row: DailyAgendaRow,
  columns: readonly { key: string; fieldId?: string }[],
): Readonly<Record<string, CompoundSlotValue>> | undefined {
  let slots: Record<string, CompoundSlotValue> | undefined;
  for (const col of columns) {
    if (!col.fieldId) continue;
    const value = resolveDailySlotValue(row, col.fieldId);
    if (!value) continue;
    slots ??= {};
    slots[col.key] = value;
  }
  return slots;
}
