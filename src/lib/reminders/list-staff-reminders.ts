/**
 * **listStaffReminders** — the one resolver behind `GET /api/v1/reminders`:
 * every instant a staffer's phone should ring in a window, from both sources.
 *
 * Pure orchestration over a {@link StaffReminderDeps} seam; the real bindings
 * live in `list-staff-reminders-db.ts` (house split, like `list-tasks.ts` /
 * `list-tasks-db.ts`). The deps only NARROW (by staffer, window, day); every
 * rule that decides whether something rings lives here, so it unit-tests with
 * zero DB.
 *
 * ## Tasks
 * `FOLLOW_UP` rows assigned to the staffer and still open (OPEN / ASSIGNED /
 * IN_PROGRESS). A task rings at `remind_at`; a task with a deadline but no
 * `remind_at` rings AT its deadline, so a due date alone still notifies — the
 * desk never has to ask "did you also want a reminder?". An explicit
 * `remind_at` outside the window wins over a deadline inside it: the operator
 * picked when to be nudged.
 *
 * ## Checklist
 * For each warehouse civil day the window can ring on, the items live that day
 * (the shared window predicate in `daily-checks/queries.ts`) with a due time
 * and an offset, that this staffer owes (recurring / unowned / owned by them —
 * the report's per-staff denominator), minus the days they already ticked.
 * Rings at `civil(day, due_time) − offset` in the warehouse zone.
 *
 * The days scanned run PAST the window's last day by one: an offset may be up
 * to a whole day, so tomorrow's 08:00 item with a 1440-minute offset rings
 * today and belongs in today's feed.
 */

import {
  isTaskDeskOpen,
  isTaskDeskStatus,
  taskDeskRecordLabel,
  taskDeskTitle,
  type TaskDeskTicket,
} from '@/lib/tasks/task-desk-row';
import { TASK_PRIORITY, type TaskEntityType } from '@/lib/tasks/task-vocabulary';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  addDaysToDateKey,
  formatMonthDayTimePST,
  toPSTDateKey,
  warehouseCivilTimeToInstant,
} from '@/utils/date';

import type { StaffReminder, StaffRemindersPayload } from './reminder-contract';

const DAY_MS = 86_400_000;

/** A thrown task that may ring — pre-narrowed by staffer and window. */
export interface TaskReminderCandidate {
  id: number;
  /** Null on both for a standalone task. */
  entityType: TaskEntityType | null;
  entityId: number | null;
  /** `work_assignments.notes` — the thrower's words. */
  note: string | null;
  /** Named umbrella project; falls back to the first line of instructions. */
  projectName: string | null;
  /** `assignment_status_enum` label, verbatim. */
  status: string;
  priority: number;
  remindAt: string | null;
  deadlineAt: string | null;
  assignedByName: string | null;
  /** The paired ticket's local caches on a ticket task — its label prints the provider number. */
  ticket: TaskDeskTicket | null;
}

/** A checklist item live on `dayKey` that this staffer owes, with a reminder set. */
export interface ChecklistReminderCandidate {
  itemId: number;
  dayKey: string;
  title: string;
  /** Civil `HH:MM`, warehouse zone. */
  dueTime: string;
  remindOffsetMinutes: number;
}

export interface StaffReminderDeps {
  /**
   * Tasks assigned to `staffId` whose `remind_at` — or, lacking one, whose
   * `deadline_at` — falls in `[fromIso, toIso)`.
   */
  listTaskCandidates(orgId: OrgId, staffId: number, fromIso: string, toIso: string): Promise<TaskReminderCandidate[]>;
  /** One row per (live, owed, reminder-bearing item) × day in `dayKeys`. */
  listChecklistCandidates(orgId: OrgId, staffId: number, dayKeys: string[]): Promise<ChecklistReminderCandidate[]>;
  /** The staffer's own marks on `dayKeys`. */
  listChecklistMarks(orgId: OrgId, staffId: number, dayKeys: string[]): Promise<Array<{ itemId: number; dayKey: string }>>;
}

export interface ListStaffRemindersOptions {
  fromMs: number;
  days: number;
  /** Task reminders need `work_orders.claim`; the checklist is everyone's. */
  includeTasks: boolean;
}

export async function listStaffReminders(
  orgId: OrgId,
  staffId: number,
  opts: ListStaffRemindersOptions,
  deps: StaffReminderDeps,
): Promise<StaffRemindersPayload['data']> {
  const fromMs = opts.fromMs;
  const toMs = fromMs + opts.days * DAY_MS;
  const fromIso = new Date(fromMs).toISOString();
  const toIso = new Date(toMs).toISOString();

  const dayKeys = checklistDayKeys(fromMs, toMs);
  const [tasks, items, marks] = await Promise.all([
    opts.includeTasks ? deps.listTaskCandidates(orgId, staffId, fromIso, toIso) : Promise.resolve([]),
    deps.listChecklistCandidates(orgId, staffId, dayKeys),
    deps.listChecklistMarks(orgId, staffId, dayKeys),
  ]);

  const reminders: StaffReminder[] = [];

  for (const task of tasks) {
    if (!isTaskDeskStatus(task.status) || !isTaskDeskOpen(task.status)) continue;
    const ringsAt = task.remindAt ?? task.deadlineAt;
    const ringsMs = ringsAt == null ? NaN : Date.parse(ringsAt);
    if (!Number.isFinite(ringsMs) || ringsMs < fromMs || ringsMs >= toMs) continue;
    reminders.push(taskReminder(task, ringsMs));
  }

  const marked = new Set(marks.map((m) => `${m.itemId}:${m.dayKey}`));
  for (const item of items) {
    if (marked.has(`${item.itemId}:${item.dayKey}`)) continue;
    const due = warehouseCivilTimeToInstant(item.dayKey, item.dueTime);
    if (!due) continue;
    const ringsMs = due.getTime() - item.remindOffsetMinutes * 60_000;
    if (ringsMs < fromMs || ringsMs >= toMs) continue;
    reminders.push({
      id: `checklist:${item.itemId}:${item.dayKey}`,
      source: 'checklist',
      sourceId: item.itemId,
      title: item.title,
      body: `Daily check · due ${formatMonthDayTimePST(due, { hour12: true })}`,
      dueAt: due.toISOString(),
      remindAt: new Date(ringsMs).toISOString(),
      urgent: false,
      deepLink: '/m/home',
    });
  }

  reminders.sort((a, b) => Date.parse(a.remindAt) - Date.parse(b.remindAt) || a.id.localeCompare(b.id));

  return { generatedAt: new Date().toISOString(), staffId, from: fromIso, to: toIso, reminders };
}

/**
 * Civil days whose due times can ring inside `[fromMs, toMs)`: from the day
 * `from` falls on through the day AFTER the window's last instant (offset ≤ one
 * day — see the module doc). A ring never precedes `from`, and it never follows
 * its due time, so no earlier day can contribute.
 */
function checklistDayKeys(fromMs: number, toMs: number): string[] {
  const first = toPSTDateKey(new Date(fromMs));
  const last = addDaysToDateKey(toPSTDateKey(new Date(toMs - 1)), 1);
  const keys: string[] = [];
  for (let key = first; key && key <= last; key = addDaysToDateKey(key, 1)) keys.push(key);
  return keys;
}

function taskReminder(task: TaskReminderCandidate, ringsMs: number): StaffReminder {
  const recordLabel = taskDeskRecordLabel(task);
  // A notification title is one plain line — the instructions are markdown.
  // A standalone task has no record phrase, so its body starts at the sender.
  const parts: string[] = recordLabel ? [recordLabel] : ['Task'];
  if (task.assignedByName) parts.push(`from ${task.assignedByName}`);
  if (task.deadlineAt) parts.push(`due ${formatMonthDayTimePST(task.deadlineAt, { hour12: true })}`);
  return {
    id: `task:${task.id}`,
    source: 'task',
    sourceId: task.id,
    title: taskDeskTitle(task),
    body: parts.join(' · '),
    dueAt: task.deadlineAt,
    remindAt: new Date(ringsMs).toISOString(),
    urgent: task.priority <= TASK_PRIORITY.urgent,
    deepLink: `/m/home?task=${task.id}`,
  };
}
