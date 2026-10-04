/**
 * A task's due date as the house date switcher edits it (desk record + phone
 * sheet). Task principle P5: a due date is an exact value, so it is a calendar
 * (`DateRangePickerField variant="compact"`) with Today · Tomorrow · Next week
 * presets — never chips alone.
 *
 * The rule is unchanged: a due day is saved as the END of the warehouse working
 * day, 17:00 warehouse civil time, via `warehouseCivilTimeToInstant`.
 */

import {
  addDaysToDateKey,
  dateKeyToLocalDate,
  getCurrentPSTDateKey,
  localDateToDateKey,
  toPSTDateKey,
  warehouseCivilTimeToInstant,
} from '@/utils/date';

/** The warehouse wall clock a due day ends at. */
const TASK_DUE_TIME = '17:00';

/** The civil due day on the calendar (a local-midnight Date for the widget), or `undefined` when none. */
export function taskDueDay(deadlineAtMs: number | null): Date | undefined {
  if (deadlineAtMs == null) return undefined;
  return dateKeyToLocalDate(toPSTDateKey(new Date(deadlineAtMs)));
}

/** A day picked on the calendar → the `deadlineAt` instant the route stores (17:00 warehouse time). */
export function taskDueInstantIso(day: Date): string | null {
  const key = localDateToDateKey(day);
  return key ? (warehouseCivilTimeToInstant(key, TASK_DUE_TIME)?.toISOString() ?? null) : null;
}

/** Today's warehouse civil day plus `days`, as a calendar Date. */
function warehouseDayFromToday(days: number): Date {
  return dateKeyToLocalDate(addDaysToDateKey(getCurrentPSTDateKey(), days)) ?? new Date();
}

/** The due presets — read at click time, so a record left open past midnight still means "today". */
export const TASK_DUE_PRESETS: ReadonlyArray<{ label: string; day: () => Date }> = [
  { label: 'Today', day: () => warehouseDayFromToday(0) },
  { label: 'Tomorrow', day: () => warehouseDayFromToday(1) },
  { label: 'Next week', day: () => warehouseDayFromToday(7) },
];
