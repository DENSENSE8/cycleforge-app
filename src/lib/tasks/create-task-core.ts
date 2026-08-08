/**
 * Throw a task at a colleague — the pure orchestration half.
 *
 * Split from its server binding so the refusals, the urgency coupling and the
 * degrade rules unit-test with zero database and zero helpdesk network
 * (`.claude/rules/backend-patterns.md` → Dependency injection for testability).
 *
 * ## The two effects, and why one of them may fail without failing the throw
 *
 * A throw does two things: it creates the task, and — when the thrower marked
 * it urgent — it promotes the underlying record through the cross-entity
 * urgency SoT so it also surfaces in the Urgent lanes everyone already watches.
 *
 * The second one is allowed to fail. Urgency promotion can reach a helpdesk
 * that is down, or a record that was deleted between the resolve and the throw;
 * a task that lands with `urgency: 'failed'` is strictly better than an
 * operator being told their handoff did not happen when it did. The task is the
 * commitment; the promotion is an amplifier. Degrade-not-fail, per the Station
 * contract that governs the surface this is thrown from.
 *
 * The inverse is NOT true: if the task insert fails, the whole throw fails. We
 * never promote a record to urgent on behalf of a handoff that does not exist.
 */

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
  entityType: TaskEntityType;
  entityId: number;
  assigneeStaffId: number;
  priority: number;
  note: string | null;
}

export interface InsertTaskArgs {
  entityType: TaskEntityType;
  entityId: number;
  assigneeStaffId: number;
  /** Who threw it (2026-08-08d) — what makes a "sent" view writable. */
  assignedByStaffId: number;
  priority: number;
  note: string | null;
  status: typeof TASK_INITIAL_STATUS;
}

/** Mirrors `PromoteUrgencyResult` minus the fields this module does not use. */
export type PromoteOutcome = { ok: true; changed: boolean } | { ok: false; reason: string };

export interface NotifyAssigneeArgs {
  task: TaskRow;
  actorStaffId: number;
  urgent: boolean;
}

export interface CreateTaskDeps {
  insertTask(args: InsertTaskArgs): Promise<TaskRow>;
  promoteUrgency(entityType: TaskEntityType, entityId: number): Promise<PromoteOutcome>;
  /** Writes the durable inbox row and pushes it live. Best-effort — see below. */
  notifyAssignee(args: NotifyAssigneeArgs): Promise<void>;
}

export interface CreateTaskInput {
  entityType: unknown;
  entityId: unknown;
  assigneeStaffId: unknown;
  /** Free text the thrower typed. Optional — the record is often the whole message. */
  note?: unknown;
  urgency?: TaskUrgency;
  /** Who is throwing. Used to refuse a self-throw. */
  actorStaffId: number;
}

/**
 * `urgency` reports what happened to the RECORD, not to the task row:
 *   • `promoted`   — the record was moved to urgent by this throw
 *   • `already`    — it was already urgent; nothing was written
 *   • `not_urgent` — the thrower did not mark it urgent
 *   • `failed`     — promotion was attempted and did not land (see above)
 */
export type CreateTaskResult =
  | {
      ok: true;
      task: TaskRow;
      urgency: 'promoted' | 'already' | 'not_urgent' | 'failed';
      /**
       * Whether the recipient was told:
       *   • `sent`           — durable inbox row written and pushed
       *   • `skipped_entity` — this record kind cannot be anchored in the inbox
       *                        yet (support_ticket — `isInboxAnchorable`)
       *   • `failed`         — attempted and did not land
       *
       * `skipped_entity` is reported rather than hidden because a task nobody
       * is notified about looks identical to one that was delivered, and the
       * thrower deserves to know which they got.
       */
      notified: 'sent' | 'skipped_entity' | 'failed';
    }
  | {
      ok: false;
      reason: 'unsupported_entity' | 'invalid_entity_id' | 'invalid_assignee' | 'self_throw' | 'note_too_long';
    };

/**
 * A note is a handoff, not a document. The cap matches `staff_messages.body`
 * (5000) so a message that would fit the DM store also fits here — one number
 * for "how much can an operator type at a colleague", not two that disagree.
 */
export const TASK_NOTE_MAX = 5000;

export async function createTaskCore(
  input: CreateTaskInput,
  deps: CreateTaskDeps,
): Promise<CreateTaskResult> {
  if (!isTaskEntityType(input.entityType)) return { ok: false, reason: 'unsupported_entity' };
  const entityType: TaskEntityType = input.entityType;

  const entityId = Number(input.entityId);
  if (!Number.isInteger(entityId) || entityId <= 0) return { ok: false, reason: 'invalid_entity_id' };

  const assigneeStaffId = Number(input.assigneeStaffId);
  if (!Number.isInteger(assigneeStaffId) || assigneeStaffId <= 0) {
    return { ok: false, reason: 'invalid_assignee' };
  }

  // Throwing at yourself is a no-op that costs the recipient an inbox row and
  // the thrower a notification of their own action. Refuse it explicitly rather
  // than letting it look like it worked.
  if (assigneeStaffId === input.actorStaffId) return { ok: false, reason: 'self_throw' };

  const rawNote = typeof input.note === 'string' ? input.note.trim() : '';
  if (rawNote.length > TASK_NOTE_MAX) return { ok: false, reason: 'note_too_long' };
  const note = rawNote.length > 0 ? rawNote : null;

  const urgency: TaskUrgency = input.urgency ?? 'normal';

  const task = await deps.insertTask({
    entityType,
    entityId,
    assigneeStaffId,
    assignedByStaffId: input.actorStaffId,
    priority: taskPriorityFor(urgency),
    note,
    status: TASK_INITIAL_STATUS,
  });

  const isUrgent = urgency === 'urgent';

  // Both of the remaining effects are AMPLIFIERS on a commitment that already
  // landed. Neither may turn a written task into a reported failure.
  const notified = await notifyQuietly(deps, {
    task,
    actorStaffId: input.actorStaffId,
    urgent: isUrgent,
  }, entityType);

  if (!isUrgent) return { ok: true, task, urgency: 'not_urgent', notified };

  let outcome: PromoteOutcome;
  try {
    outcome = await deps.promoteUrgency(entityType, entityId);
  } catch {
    return { ok: true, task, urgency: 'failed', notified };
  }

  if (!outcome.ok) return { ok: true, task, urgency: 'failed', notified };
  return { ok: true, task, urgency: outcome.changed ? 'promoted' : 'already', notified };
}

async function notifyQuietly(
  deps: CreateTaskDeps,
  args: NotifyAssigneeArgs,
  entityType: TaskEntityType,
): Promise<'sent' | 'skipped_entity' | 'failed'> {
  // Refuse in the domain rather than letting the insert raise a CHECK
  // violation: `staff_inbox_items.entity_type` does not admit every throwable
  // kind yet, and a constraint error is not something an operator can act on.
  if (!isInboxAnchorable(entityType)) return 'skipped_entity';

  try {
    await deps.notifyAssignee(args);
    return 'sent';
  } catch {
    return 'failed';
  }
}
