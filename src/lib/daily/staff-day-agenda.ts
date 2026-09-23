/**
 * One staffer's day across BOTH task stores — the merged read model behind the
 * manager report.
 *
 * The operator's ruling (2026-09-23): the phone shows ONE task system. Two
 * stores stay, because neither can absorb the other without a migration that
 * loses something — `daily_check_items`/`daily_check_marks` is a per-staff,
 * per-day ATTESTATION (a recurring row is owed again tomorrow and its mark is
 * private to the person who made it), while `work_assignments` `FOLLOW_UP` is a
 * HANDOFF with one assignee, a deadline and a terminal status. What unifies is
 * the READ: "what did this person do on this day, and when".
 *
 * PURE, like {@link buildStaffDay} it wraps and {@link dailyAgendaFromTask}
 * beside it: no React, no fetch, no DB. Both inputs are already-assembled view
 * models (`GET /api/daily-checks?scope=all` and `GET /api/tasks`), so this adds
 * no query and no endpoint.
 *
 * ## The load-bearing decisions
 *
 * - **`key` is `source:id`, never `id`.** The two stores number their rows
 *   independently; `daily_check_items.id = 7` and `work_assignments.id = 7`
 *   both exist and both belong on the same day. A bare id as a React key is a
 *   silently dropped row.
 * - **Counts are SUMMED, never re-derived.** `checkDone/checkTotal` come
 *   straight off {@link StaffDay}, whose per-staff denominator already handles
 *   owned one-offs. Recomputing it here is how two surfaces start printing
 *   different fractions for one shift.
 * - **A done task belongs to the day it was FINISHED on**, in the warehouse
 *   civil day — not the day it was thrown. A task handed over Monday and
 *   finished Wednesday is Wednesday's work; putting it on Monday would credit
 *   a shift for something it did not do, and putting it on both would double
 *   the denominator.
 * - **An open task is OWED on every day from its handoff onward.** That is
 *   what "still open" means to the floor: it keeps showing up until it is done.
 */

import {
  isTaskDeskOpen,
  taskDeskRecordLabel,
  taskDeskTicketNumber,
  type TaskDeskRow,
} from '@/lib/tasks/task-desk-row';
import type { TaskUrgency } from '@/lib/tasks/task-vocabulary';
import type { StaffDay } from '@/lib/daily-checks/staff-day';
import { toPSTDateKey } from '@/utils/date';

/** Which store a row came out of. The only thing a reader needs to know. */
export type StaffDayEntrySource = 'check' | 'task';

/** One piece of work on one staffer's day, from either store. */
export interface StaffDayEntry {
  /**
   * `source:id`. The two stores number rows independently, so the raw id
   * collides across them — see the module note.
   */
  key: string;
  source: StaffDayEntrySource;
  /** The row's id WITHIN its own store. */
  id: number;
  title: string;
  /** Checklist cadence; null on a task, which has no cadence. */
  cadence: 'recurring' | 'once' | null;
  /** The linked helpdesk ticket number, from either store's own notion of it. */
  ticketId: number | null;
  /** `Ticket 48120` / `Carton 4412` — the record a task points at. Null on a check. */
  recordLabel: string | null;
  /** Task urgency; null on a check, which has none. */
  urgency: TaskUrgency | null;
  /** ISO instant it was ticked / completed, or null while still owed. */
  doneAt: string | null;
}

/** One staffer's whole day, both stores merged, ready to render. */
export interface StaffDayAgenda {
  /** Warehouse civil day, `YYYY-MM-DD`. */
  dateKey: string;
  staffId: number;
  name: string;
  /** The combined fraction the roster card prints. */
  doneCount: number;
  total: number;
  /** The checklist half, verbatim from {@link StaffDay}. */
  checkDone: number;
  checkTotal: number;
  /** The assigned-task half, derived from membership below. */
  taskDone: number;
  taskTotal: number;
  /** Newest instant from EITHER store, or null when they touched nothing. */
  lastActivityAt: string | null;
  entries: StaffDayEntry[];
}

/**
 * Where a task lands on one staffer's day, or `null` for "not this day".
 *
 * `CANCELED` is neither done nor owed — it was withdrawn, so counting it as
 * owed would blame a staffer for work nobody wants any more, and counting it
 * as done would credit them for work nobody did.
 */
function taskPlacement(
  row: TaskDeskRow,
  staffId: number,
  dateKey: string,
): { lane: 'done'; atMs: number } | { lane: 'owed' } | null {
  if (row.assignee?.id !== staffId) return null;
  if (row.status === 'CANCELED') return null;

  if (row.status === 'DONE') {
    // A DONE row with no instant cannot be placed on any civil day, and this
    // module never guesses the date of a write.
    if (row.completedAtMs == null) return null;
    return toPSTDateKey(new Date(row.completedAtMs)) === dateKey
      ? { lane: 'done', atMs: row.completedAtMs }
      : null;
  }

  if (!isTaskDeskOpen(row.status)) return null;
  // Still open: owed on this day and every day since the handoff. A task
  // thrown TOMORROW is not yesterday's miss.
  return toPSTDateKey(new Date(row.assignedAtMs)) <= dateKey ? { lane: 'owed' } : null;
}

function entryFromTask(row: TaskDeskRow, doneAt: string | null): StaffDayEntry {
  return {
    key: `task:${row.id}`,
    source: 'task',
    id: row.id,
    // A handoff with no words still gets a row; it names the record rather
    // than painting an empty title.
    title: row.note || taskDeskRecordLabel(row),
    cadence: null,
    ticketId: taskDeskTicketNumber(row),
    recordLabel: taskDeskRecordLabel(row),
    urgency: row.urgency,
    doneAt,
  };
}

/** Owed-task order, the desk's own: urgent first, then nearest deadline (null last). */
function byUrgencyThenDeadline(a: TaskDeskRow, b: TaskDeskRow): number {
  const aUrgent = a.urgency === 'urgent' ? 0 : 1;
  const bUrgent = b.urgency === 'urgent' ? 0 : 1;
  if (aUrgent !== bUrgent) return aUrgent - bUrgent;
  const aDue = a.deadlineAtMs ?? Number.POSITIVE_INFINITY;
  const bDue = b.deadlineAtMs ?? Number.POSITIVE_INFINITY;
  if (aDue !== bDue) return aDue - bDue;
  return a.id - b.id;
}

/**
 * Merge one staffer's checklist day with the tasks thrown at them.
 *
 * Entry order answers the two questions this screen is opened for, in the
 * order a manager asks them: "walk me through the shift" is the done half,
 * chronological ACROSS both stores (a tick at 09:12 and a task finished at
 * 09:30 read as one timeline, because that is what the shift was); "what is
 * still open" is the tail, checks in the list's authored order and then tasks
 * in the desk's own priority order.
 */
export function buildStaffDayAgenda(
  day: StaffDay,
  tasks: readonly TaskDeskRow[],
): StaffDayAgenda {
  const doneEntries: Array<{ at: number; entry: StaffDayEntry }> = [];
  const owedChecks: StaffDayEntry[] = [];

  for (const task of day.tasks) {
    const entry: StaffDayEntry = {
      key: `check:${task.itemId}`,
      source: 'check',
      id: task.itemId,
      title: task.title,
      cadence: task.kind,
      ticketId: task.ticketId,
      recordLabel: null,
      urgency: null,
      doneAt: task.checkedAt,
    };
    if (task.checkedAt != null) {
      doneEntries.push({ at: Date.parse(task.checkedAt), entry });
    } else {
      owedChecks.push(entry);
    }
  }

  const owedTasks: TaskDeskRow[] = [];
  let taskDone = 0;
  let newestTaskDoneMs: number | null = null;

  for (const row of tasks) {
    const placement = taskPlacement(row, day.staffId, day.dateKey);
    if (placement === null) continue;
    if (placement.lane === 'owed') {
      owedTasks.push(row);
      continue;
    }
    taskDone += 1;
    if (newestTaskDoneMs == null || placement.atMs > newestTaskDoneMs) {
      newestTaskDoneMs = placement.atMs;
    }
    doneEntries.push({
      at: placement.atMs,
      entry: entryFromTask(row, new Date(placement.atMs).toISOString()),
    });
  }

  doneEntries.sort((a, b) => a.at - b.at || a.entry.key.localeCompare(b.entry.key));
  owedTasks.sort(byUrgencyThenDeadline);

  const taskTotal = taskDone + owedTasks.length;
  // Compared as INSTANTS, not as strings: the two stores spell a timestamp
  // differently (`+00:00` vs `Z`), and `localeCompare` on those is a lie.
  const lastMarkedMs = day.lastMarkedAt == null ? null : Date.parse(day.lastMarkedAt);
  const markWins =
    lastMarkedMs != null &&
    Number.isFinite(lastMarkedMs) &&
    (newestTaskDoneMs == null || lastMarkedMs >= newestTaskDoneMs);
  const lastActivityAt = markWins
    ? day.lastMarkedAt
    : newestTaskDoneMs == null
      ? null
      : new Date(newestTaskDoneMs).toISOString();

  return {
    dateKey: day.dateKey,
    staffId: day.staffId,
    name: day.name,
    doneCount: day.doneCount + taskDone,
    total: day.total + taskTotal,
    checkDone: day.doneCount,
    checkTotal: day.total,
    taskDone,
    taskTotal,
    lastActivityAt,
    entries: [
      ...doneEntries.map((d) => d.entry),
      ...owedChecks,
      ...owedTasks.map((row) => entryFromTask(row, null)),
    ],
  };
}

/**
 * Every staffer's merged day, in the roster order {@link StaffDay} arrived in
 * (least done first — the report is read to find who still owes work).
 */
export function buildStaffDayAgendas(
  days: readonly StaffDay[],
  tasks: readonly TaskDeskRow[],
): StaffDayAgenda[] {
  return days.map((day) => buildStaffDayAgenda(day, tasks));
}
