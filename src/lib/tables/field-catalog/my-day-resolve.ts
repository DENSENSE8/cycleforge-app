/**
 * My-Day slot resolvers — row + fieldId → the resolved fact a slot cell paints.
 * Pure functions; no React, no hooks.
 *
 * Vocabularies are never declared here: the lane resolves through
 * `myDayLaneShortLabel` and the lifecycle through `workStatusLabel`, the same
 * SoTs the chips read.
 */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import { myDayLaneShortLabel, type MyDayTask } from '@/lib/my-day/my-day-tasks';
import { workStatusLabel } from '@/lib/work-orders/work-status-display';
import { formatDateKeyShort } from '@/utils/date';

function str(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

/**
 * Resolve one bound field for one row. Unknown field id → null (the cell
 * dashes); the layout resolver has already dropped stale bindings.
 */
export function resolveMyDaySlotValue(
  task: MyDayTask,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'my-day.task':
      return { kind: 'value', text: str(task.id) };
    case 'my-day.lane':
      // A lane the registry does not know falls back to its raw code rather
      // than resolving `undefined` — a cell that paints nothing for a lane the
      // feed genuinely reported would hide a data problem, not an absent fact.
      return { kind: 'value', text: myDayLaneShortLabel(task.lane) ?? str(task.lane) };
    case 'my-day.queue':
      return { kind: 'value', text: str(task.queueLabel) };
    case 'my-day.record':
      return { kind: 'value', text: str(task.recordLabel) };
    case 'my-day.due': {
      const raw = str(task.deadlineAt);
      return { kind: 'value', text: raw ? formatDateKeyShort(raw.slice(0, 10)) : null };
    }
    case 'my-day.status':
      // An interrupt has no status machine, so it resolves null rather than
      // borrowing a work order's vocabulary to say "open".
      return {
        kind: 'value',
        text: task.status ? (workStatusLabel(task.status) ?? task.status) : null,
      };
    default:
      return null;
  }
}
