/**
 * Daily slot resolvers — row + fieldId → the resolved fact a slot cell paints.
 * Pure functions; no React, no hooks.
 *
 * Vocabulary is never declared here: the done/open face resolves through
 * `workStatusLabel`, the same SoT the compound state pill reads.
 */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { DailyTaskRow } from '@/features/home/grid/daily-task-row';
import { workStatusLabel } from '@/lib/work-orders/work-status-display';
import { formatDateKeyShort } from '@/utils/date';

/**
 * How the SHIFT is doing on this item — `3/5`.
 *
 * An empty roster reads as `null`, not `0/0`: a day with nobody rostered has no
 * denominator to report, and a fraction over zero is a worse answer than none.
 * Same rule the note line already follows — one fact, one answer.
 */
function teamText(row: DailyTaskRow): string | null {
  return row.teamTotal > 0 ? `${row.teamDone}/${row.teamTotal}` : null;
}

/**
 * Resolve one bound field for one row. Unknown field id → null (the cell
 * dashes); the layout resolver has already dropped stale bindings.
 */
export function resolveDailySlotValue(
  row: DailyTaskRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'daily.item':
      return { kind: 'value', text: `#${row.id}` };
    case 'daily.status':
      return {
        kind: 'value',
        text: workStatusLabel(row.done ? 'DONE' : 'OPEN') ?? (row.done ? 'Done' : 'Open'),
      };
    case 'daily.team':
      return { kind: 'value', text: teamText(row) };
    case 'daily.marked':
      return {
        kind: 'value',
        text: row.markedAt ? formatDateKeyShort(row.markedAt.slice(0, 10)) : null,
      };
    case 'daily.kind':
      // Only the exception is marked: a bound Kind column dashes on recurring
      // rows rather than painting a word on a hundred unremarkable ones.
      return { kind: 'value', text: row.kind === 'once' ? 'Once' : null };
    case 'daily.owner':
      return {
        kind: 'person',
        staffId: row.assignedStaffId,
        name: row.assignedStaffName,
      };
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
  row: DailyTaskRow,
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
