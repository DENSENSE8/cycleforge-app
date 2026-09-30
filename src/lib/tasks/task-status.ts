/**
 * A task's ONE status (`TASK_STATUS_FACE`, `@/design-system/tokens/task-status`)
 * over its two stored columns: the lifecycle `work_assignments.status`
 * (`assignment_status_enum`, shared with station work) and the hold
 * `work_assignments.task_state` (2026-09-30). Pure and client-safe: the
 * desk, the phone, the Timeline and the PATCH route read it.
 *
 *   status        task_state   → TaskStatus
 *   DONE          (cleared)      Done
 *   CANCELED      (cleared)      Canceled
 *   open          PENDING…       the hold (Pending · Follow-up · Blocked)
 *   IN_PROGRESS   null           In progress
 *   OPEN/ASSIGNED null           To do
 */

import { isTaskHold, parseTaskHold, type TaskHold, type TaskStatus } from '@/design-system/tokens/task-status';
import { isTaskDeskOpen, isTaskDeskStatus, type TaskDeskStatus } from './task-desk-row';

/** The two stored columns a status reads. */
export interface TaskStatusSource {
  status: TaskDeskStatus;
  taskState: TaskHold | null;
}

export function taskStatusOf({ status, taskState }: TaskStatusSource): TaskStatus {
  if (status === 'DONE' || status === 'CANCELED') return status;
  if (taskState) return taskState;
  return status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'TODO';
}

/** Stored text (an audit row's before / after) → the status; null when the lifecycle label is unknown. */
export function taskStatusFromStored(status: unknown, taskState: unknown): TaskStatus | null {
  return isTaskDeskStatus(status) ? taskStatusOf({ status, taskState: parseTaskHold(taskState) }) : null;
}

/** Canceled is terminal; everything else is reversible (mirrors `isTaskDeskTransitionAllowed`). */
export function isTaskStatusReachable(from: TaskStatus, to: TaskStatus): boolean {
  return from !== 'CANCELED' || to === 'CANCELED';
}

/** What `PATCH /api/tasks/[id]` carries to move a task to a status. */
export interface TaskStatusPatch {
  status?: TaskDeskStatus;
  taskState?: TaskHold | null;
}

/**
 * The smallest patch that lands `target`, or null when the task is already
 * there (or cannot get there: Canceled is final). `taskState` is sent only
 * when a hold is set or cleared, so To do / In progress / Done keep working
 * on a database the 2026-09-30 migration has not reached yet.
 */
export function taskStatusPatch(current: TaskStatusSource, target: TaskStatus): TaskStatusPatch | null {
  const from = taskStatusOf(current);
  if (from === target || !isTaskStatusReachable(from, target)) return null;
  const clearHold: TaskStatusPatch = current.taskState ? { taskState: null } : {};
  if (isTaskHold(target)) {
    // Holding closed work reopens it: a hold only exists on open rows.
    return isTaskDeskOpen(current.status) ? { taskState: target } : { status: 'OPEN', taskState: target };
  }
  if (target === 'TODO') {
    return current.status === 'OPEN' || current.status === 'ASSIGNED' ? clearHold : { status: 'OPEN', ...clearHold };
  }
  return { status: target, ...clearHold };
}

/** Apply a patch to the stored pair the way the server (and its trigger) will — the optimistic caches read this. */
export function applyTaskStatusPatch(current: TaskStatusSource, patch: TaskStatusPatch): TaskStatusSource {
  const status = patch.status ?? current.status;
  const taskState = patch.taskState !== undefined ? patch.taskState : current.taskState;
  return { status, taskState: isTaskDeskOpen(status) ? taskState : null };
}
