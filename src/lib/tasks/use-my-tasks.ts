'use client';

/** The tasks thrown at the signed-in staffer, as the phone reads them. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TaskStatus } from '@/design-system/tokens/task-status';
import {
  sortTaskDeskRows,
  taskDeskRowFromWire,
  type TaskDeskListPayload,
  type TaskDeskRow,
} from '@/lib/tasks/task-desk-row';
import { applyTaskStatusPatch, taskStatusPatch, type TaskStatusPatch } from '@/lib/tasks/task-status';

/** Cookie session; never a cached answer for a list the operator just changed. */
const FRESH: RequestInit = { credentials: 'include', cache: 'no-store' };

const MY_TASKS_QUERY_KEY = ['tasks', 'mine', 'all'] as const;

async function fetchMyTasks(): Promise<TaskDeskRow[]> {
  const res = await fetch('/api/tasks?lane=all&assignee=me&limit=200', FRESH);
  if (!res.ok) throw new Error(`Could not load your tasks (${res.status})`);
  const payload = (await res.json()) as TaskDeskListPayload;
  const rows = (payload.tasks ?? []).map(taskDeskRowFromWire);
  return sortTaskDeskRows(rows.filter((row) => row.status !== 'CANCELED'));
}

/**
 * `enabled` is the PERMISSION, passed by the host: a staffer without
 * `work_orders.claim` would get a 403 that reads like an outage. No permission,
 * no query, and the list is simply the checklist.
 */
export function useMyTasks(enabled: boolean) {
  return useQuery({
    queryKey: MY_TASKS_QUERY_KEY,
    queryFn: fetchMyTasks,
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}

/**
 * The refusal, in the route's own words when it gave any. A bare status code is
 * the last resort, not the first answer — "Task 91 is canceled" is actionable
 * and "409" is not.
 */
async function patchTaskStatus(taskId: number, patch: TaskStatusPatch): Promise<void> {
  const res = await fetch(`/api/tasks/${taskId}`, {
    ...FRESH,
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    // STRICT allowlist on the route — an unknown key is a 403 naming it, so
    // this body carries the fields the verb changes and nothing else.
    body: JSON.stringify(patch),
  });
  if (res.ok) return;
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  throw new Error(body?.error || `Could not update that task (${res.status})`);
}

/**
 * The row after `patch`, the way the server writes it: the pair through
 * `applyTaskStatusPatch` (a closed status clears the hold, as the trigger
 * does), Done stamps / clears `completedAtMs`, the first In progress stamps
 * `startedAtMs`.
 */
function patchedRow(row: TaskDeskRow, patch: TaskStatusPatch, nowMs: number): TaskDeskRow {
  const next = applyTaskStatusPatch(row, patch);
  return {
    ...row,
    ...next,
    completedAtMs: next.status === 'DONE' ? (row.status === 'DONE' ? row.completedAtMs : nowMs) : null,
    startedAtMs: next.status === 'IN_PROGRESS' ? (row.startedAtMs ?? nowMs) : row.startedAtMs,
  };
}

/** Set a task's owners (lead first) — the phone's Team row adds people with it. */
export function useSetTaskOwners() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, assigneeStaffIds }: { taskId: number; assigneeStaffIds: readonly number[] }) => {
      const res = await fetch(`/api/tasks/${taskId}`, {
        ...FRESH,
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assigneeStaffIds }),
      });
      if (res.ok) return;
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error || `Could not update the team (${res.status})`);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/**
 * Set or clear a task's due instant — the phone sheet's due field (task principle P5: the
 * same house date switcher as the desk record). `deadlineAt` is the 17:00-warehouse ISO from
 * `taskDueInstantIso`, or null to clear. Optimistic, like the status verbs.
 */
export function useSetTaskDeadline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, deadlineAt }: { taskId: number; deadlineAt: string | null }) => {
      const res = await fetch(`/api/tasks/${taskId}`, {
        ...FRESH,
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deadlineAt }),
      });
      if (res.ok) return;
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error || `Could not change the due date (${res.status})`);
    },
    onMutate: async ({ taskId, deadlineAt }) => {
      await queryClient.cancelQueries({ queryKey: MY_TASKS_QUERY_KEY });
      const previous = queryClient.getQueryData<TaskDeskRow[]>(MY_TASKS_QUERY_KEY);
      if (previous) {
        const deadlineAtMs = deadlineAt == null ? null : Date.parse(deadlineAt);
        queryClient.setQueryData<TaskDeskRow[]>(
          MY_TASKS_QUERY_KEY,
          previous.map((row) => (row.id === taskId ? { ...row, deadlineAtMs } : row)),
        );
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(MY_TASKS_QUERY_KEY, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/** Tick / untick an assigned task, optimistically — the same feel as ticking a daily check, because on this list they are the same gesture. */
export function useToggleTaskDone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, done }: { taskId: number; done: boolean }) =>
      patchTaskStatus(taskId, { status: done ? 'DONE' : 'ASSIGNED' }),
    onMutate: async ({ taskId, done }) => {
      await queryClient.cancelQueries({ queryKey: MY_TASKS_QUERY_KEY });
      const previous = queryClient.getQueryData<TaskDeskRow[]>(MY_TASKS_QUERY_KEY);
      if (previous) {
        const now = Date.now();
        queryClient.setQueryData<TaskDeskRow[]>(
          MY_TASKS_QUERY_KEY,
          previous.map((row) => (row.id === taskId ? patchedRow(row, { status: done ? 'DONE' : 'ASSIGNED' }, now) : row)),
        );
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(MY_TASKS_QUERY_KEY, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/**
 * Move a task to one of the seven statuses (`TASK_STATUS_FACE`) — the phone
 * sheet's status picker, its quick slider and its Start / Mark done / Reopen.
 * The patch is the smallest one that lands `target` (`taskStatusPatch`);
 * already there, or Canceled → no request. Starting stamps `started_at` on
 * the route (first start only). A hold before the 2026-09-30 migration is the
 * route's 409, in its own words, as the mutation error.
 */
export function useSetTaskStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ row, target }: { row: TaskDeskRow; target: TaskStatus }) => {
      const patch = taskStatusPatch(row, target);
      if (patch) await patchTaskStatus(row.id, patch);
    },
    onMutate: async ({ row, target }) => {
      const patch = taskStatusPatch(row, target);
      if (!patch) return { previous: undefined };
      await queryClient.cancelQueries({ queryKey: MY_TASKS_QUERY_KEY });
      const previous = queryClient.getQueryData<TaskDeskRow[]>(MY_TASKS_QUERY_KEY);
      if (previous) {
        const now = Date.now();
        queryClient.setQueryData<TaskDeskRow[]>(
          MY_TASKS_QUERY_KEY,
          previous.map((cached) => (cached.id === row.id ? patchedRow(cached, patch, now) : cached)),
        );
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(MY_TASKS_QUERY_KEY, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
