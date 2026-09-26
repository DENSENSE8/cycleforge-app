/** **listStaffReminders** — the one resolver behind `GET /api/v1/reminders`: */

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

/** Civil days whose due times can ring inside `[fromMs, toMs)`: */
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
