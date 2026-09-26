/** Throw a task at a colleague — the pure orchestration half. */

import {
  isInboxAnchorable,
  isTaskEntityType,
  TASK_INITIAL_STATUS,
  taskPriorityFor,
  type TaskEntityType,
  type TaskUrgency,
} from './task-vocabulary';

export interface TaskRow {
  id: number;
  /** The record the task is about, or null for a standalone task. */
  entityType: TaskEntityType | null;
  entityId: number | null;
  assigneeStaffId: number;
  assigneeStaffIds: number[];
  projectName: string | null;
  priority: number;
  note: string | null;
}

export interface InsertTaskArgs {
  entityType: TaskEntityType | null;
  entityId: number | null;
  assigneeStaffId: number;
  assigneeStaffIds: number[];
  projectName: string | null;
  /**
   * Who threw it (2026-08-08d) — what makes a "sent" view writable.
   * NULL when the thrower is the SYSTEM (a cron ingesting a helpdesk tag), which
   * is exactly the "not recorded" the column was born nullable for.
   */
  assignedByStaffId: number | null;
  priority: number;
  note: string | null;
  /** ISO instant, or null for "no promised day". Stored in `deadline_at`. */
  deadlineAt: string | null;
  /**
   * ISO instant to remind the assignee, or null. Stored in `remind_at`
   * (2026-09-25b) and read by the native reminder feed (`listStaffReminders`).
   */
  remindAt: string | null;
  status: typeof TASK_INITIAL_STATUS;
}

/** Mirrors `PromoteUrgencyResult` minus the fields this module does not use. */
export type PromoteOutcome = { ok: true; changed: boolean } | { ok: false; reason: string };

export interface NotifyAssigneeArgs {
  task: TaskRow;
  recipientStaffId: number;
  actorStaffId: number | null;
  urgent: boolean;
}

export interface CreateTaskDeps {
  insertTask(args: InsertTaskArgs): Promise<TaskRow | null>;
  promoteUrgency(entityType: TaskEntityType, entityId: number): Promise<PromoteOutcome>;
  /** Writes the durable inbox row and pushes it live. Best-effort — see below. */
  notifyAssignee(args: NotifyAssigneeArgs): Promise<void>;
}

export interface CreateTaskInput {
  /** Absent/null on BOTH = a standalone task with no record behind it. */
  entityType?: unknown;
  entityId?: unknown;
  assigneeStaffId: unknown;
  assigneeStaffIds?: unknown;
  projectName?: unknown;
  /** Free text the thrower typed. Optional — the record is often the whole message. */
  note?: unknown;
  urgency?: TaskUrgency;
  /** Optional promised day, so the composer can capture assignee · priority · deadline in ONE create. */
  deadlineAt?: unknown;
  /** Optional reminder instant, ISO string, or null/absent for none. */
  remindAt?: unknown;
  /**
   * Who is throwing. Used to refuse a self-throw. NULL = thrown by the system,
   * which nobody can self-throw at, so the refusal does not apply.
   */
  actorStaffId: number | null;
}

/** `urgency` reports what happened to the RECORD, not to the task row: */
export type CreateTaskResult =
  | {
      ok: true;
      task: TaskRow;
      urgency: 'promoted' | 'already' | 'not_urgent' | 'failed' | 'no_record';
      /** Whether the recipient was told: */
      notified: 'sent' | 'skipped_entity' | 'failed';
      notifications: Array<{ staffId: number; status: 'sent' | 'skipped_entity' | 'failed' }>;
    }
  | {
      ok: false;
      reason:
        | 'unsupported_entity'
        | 'missing_title'
        | 'invalid_entity_id'
        | 'invalid_assignee'
        | 'note_too_long'
        | 'project_name_too_long'
        | 'invalid_project_name'
        | 'invalid_deadline'
        | 'invalid_reminder';
    };

/**
 * A note is a handoff, not a document. The cap matches `staff_messages.body`
 * (5000) so a message that would fit the DM store also fits here — one number
 * for "how much can an operator type at a colleague", not two that disagree.
 */
export const TASK_NOTE_MAX = 5000;
export const TASK_PROJECT_NAME_MAX = 160;
export const TASK_ASSIGNEES_MAX = 20;
export const TASK_STAFF_ID_MAX = 2_147_483_647;

export async function createTaskCore(
  input: CreateTaskInput,
  deps: CreateTaskDeps,
): Promise<CreateTaskResult> {
  // Both absent = a standalone task. Half an anchor is a malformed request,
  // never silently a standalone task.
  const standalone = input.entityType == null && input.entityId == null;
  let entityType: TaskEntityType | null = null;
  let entityId: number | null = null;
  if (!standalone) {
    if (!isTaskEntityType(input.entityType)) return { ok: false, reason: 'unsupported_entity' };
    entityType = input.entityType;
    entityId = Number(input.entityId);
    if (!Number.isInteger(entityId) || entityId <= 0) return { ok: false, reason: 'invalid_entity_id' };
  }

  const rawAssignees = input.assigneeStaffIds === undefined ? [input.assigneeStaffId] : input.assigneeStaffIds;
  if (!Array.isArray(rawAssignees) || rawAssignees.length < 1 ||
      rawAssignees.length > TASK_ASSIGNEES_MAX ||
      rawAssignees.some((id) => !Number.isSafeInteger(id) || id <= 0 || id > TASK_STAFF_ID_MAX) ||
      new Set(rawAssignees).size !== rawAssignees.length) {
    return { ok: false, reason: 'invalid_assignee' };
  }
  const assigneeStaffIds: number[] = rawAssignees;
  const assigneeStaffId = assigneeStaffIds[0];

  const rawNote = typeof input.note === 'string' ? input.note.trim() : '';
  if (rawNote.length > TASK_NOTE_MAX) return { ok: false, reason: 'note_too_long' };
  const note = rawNote.length > 0 ? rawNote : null;
  if (input.projectName != null && typeof input.projectName !== 'string') {
    return { ok: false, reason: 'invalid_project_name' };
  }
  const projectName = typeof input.projectName === 'string' ? input.projectName.trim() : null;
  if (projectName && projectName.length > TASK_PROJECT_NAME_MAX) {
    return { ok: false, reason: 'project_name_too_long' };
  }
  // With no record there is nothing else to name the task by.
  if (standalone && !note && !projectName) return { ok: false, reason: 'missing_title' };

  const urgency: TaskUrgency = input.urgency ?? 'normal';

  // An unparseable deadline or reminder is refused, never dropped: a composer
  // that sent a day and got a task with no day back would be lying to the
  // operator.
  const deadlineAt = isoInstantOrNull(input.deadlineAt);
  if (deadlineAt === undefined) return { ok: false, reason: 'invalid_deadline' };
  const remindAt = isoInstantOrNull(input.remindAt);
  if (remindAt === undefined) return { ok: false, reason: 'invalid_reminder' };

  const task = await deps.insertTask({
    entityType,
    entityId,
    assigneeStaffId,
    assigneeStaffIds,
    projectName: projectName || null,
    assignedByStaffId: input.actorStaffId,
    priority: taskPriorityFor(urgency),
    note,
    deadlineAt,
    remindAt,
    status: TASK_INITIAL_STATUS,
  });
  if (!task) return { ok: false, reason: 'invalid_assignee' };

  const isUrgent = urgency === 'urgent';

  // Both of the remaining effects are AMPLIFIERS on a commitment that already
  // landed. Neither may turn a written task into a reported failure.
  const notifications: Array<{ staffId: number; status: 'sent' | 'skipped_entity' | 'failed' }> = [];
  // The creator already knows; an inbox row for your own action is noise.
  for (const recipientStaffId of task.assigneeStaffIds.filter((id) => id !== input.actorStaffId)) {
    notifications.push({
      staffId: recipientStaffId,
      status: await notifyQuietly(deps, {
        task, recipientStaffId, actorStaffId: input.actorStaffId, urgent: isUrgent,
      }, entityType),
    });
  }
  const notified = notifications.some(({ status }) => status === 'failed') ? 'failed'
    : notifications.some(({ status }) => status === 'skipped_entity') ? 'skipped_entity' : 'sent';

  if (!isUrgent) return { ok: true, task, urgency: 'not_urgent', notified, notifications };
  // Urgency lives on the task's own priority; there is no record to promote.
  if (entityType == null || entityId == null) {
    return { ok: true, task, urgency: 'no_record', notified, notifications };
  }

  let outcome: PromoteOutcome;
  try {
    outcome = await deps.promoteUrgency(entityType, entityId);
  } catch {
    return { ok: true, task, urgency: 'failed', notified, notifications };
  }

  if (!outcome.ok) return { ok: true, task, urgency: 'failed', notified, notifications };
  return { ok: true, task, urgency: outcome.changed ? 'promoted' : 'already', notified, notifications };
}

/** Null/absent → null; a parseable string → canonical ISO; anything else → undefined (refuse). */
function isoInstantOrNull(raw: unknown): string | null | undefined {
  if (raw == null) return null;
  if (typeof raw !== 'string') return undefined;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

async function notifyQuietly(
  deps: CreateTaskDeps,
  args: NotifyAssigneeArgs,
  entityType: TaskEntityType | null,
): Promise<'sent' | 'skipped_entity' | 'failed'> {
  // Refuse in the domain rather than letting the insert raise a CHECK violation:
  if (entityType != null && !isInboxAnchorable(entityType)) return 'skipped_entity';

  try {
    await deps.notifyAssignee(args);
    return 'sent';
  } catch {
    return 'failed';
  }
}
