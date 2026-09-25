'use client';

/**
 * The tasks thrown at the signed-in staffer, as the phone reads them.
 *
 * ONE query for the whole list — `lane=all` — because `/m/home` shows the
 * operator's day as a single list with an All / Open / Done switch, and three
 * lanes over the wire would make the switch a network round trip for a filter
 * the client already holds. `CANCELED` rows are dropped here: a canceled
 * handoff is not work, and the lane that keeps it (`all`) exists for the desk's
 * audit view.
 *
 * Callers: `MobileDailyChecklist` (the unified Daily list), `MobileTaskSheet`
 * (one handed task's Start / Mark done / Reopen dock).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  sortTaskDeskRows,
  taskDeskRowFromWire,
  type TaskDeskListPayload,
  type TaskDeskRow,
} from '@/lib/tasks/task-desk-row';

/** Cookie session; never a cached answer for a list the operator just changed. */
const FRESH: RequestInit = { credentials: 'include', cache: 'no-store' };

export const MY_TASKS_QUERY_KEY = ['tasks', 'mine', 'all'] as const;

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
async function setTaskStatus(taskId: number, status: 'DONE' | 'ASSIGNED' | 'IN_PROGRESS'): Promise<void> {
  const res = await fetch(`/api/tasks/${taskId}`, {
    ...FRESH,
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    // STRICT allowlist on the route — an unknown key is a 403 naming it, so
    // this body carries the one field the verb changes and nothing else.
    body: JSON.stringify({ status }),
  });
  if (res.ok) return;
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  throw new Error(body?.error || `Could not update that task (${res.status})`);
}

/**
 * Tick / untick an assigned task, optimistically — the same feel as ticking a
 * daily check, because on this list they are the same gesture. Un-ticking
 * returns the row to `ASSIGNED`: it is back in someone's hands, which is what
 * the row said before it was finished.
 */
export function useToggleTaskDone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, done }: { taskId: number; done: boolean }) =>
      setTaskStatus(taskId, done ? 'DONE' : 'ASSIGNED'),
    onMutate: async ({ taskId, done }) => {
      await queryClient.cancelQueries({ queryKey: MY_TASKS_QUERY_KEY });
      const previous = queryClient.getQueryData<TaskDeskRow[]>(MY_TASKS_QUERY_KEY);
      if (previous) {
        queryClient.setQueryData<TaskDeskRow[]>(
          MY_TASKS_QUERY_KEY,
          previous.map((row) =>
            row.id === taskId
              ? {
                  ...row,
                  status: done ? 'DONE' : 'ASSIGNED',
                  completedAtMs: done ? Date.now() : null,
                }
              : row,
          ),
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
 * Pick a handed task up — `IN_PROGRESS`, which the route stamps `started_at`
 * on (first start only), so the desk's "Started" fact and the phone's Start
 * verb are one write. Optimistic like the tick: the task sheet's dock flips to
 * Mark done the moment the thumb lifts.
 */
export function useStartTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: number) => setTaskStatus(taskId, 'IN_PROGRESS'),
    onMutate: async (taskId) => {
      await queryClient.cancelQueries({ queryKey: MY_TASKS_QUERY_KEY });
      const previous = queryClient.getQueryData<TaskDeskRow[]>(MY_TASKS_QUERY_KEY);
      if (previous) {
        const now = Date.now();
        queryClient.setQueryData<TaskDeskRow[]>(
          MY_TASKS_QUERY_KEY,
          previous.map((row) =>
            row.id === taskId
              ? { ...row, status: 'IN_PROGRESS', startedAtMs: row.startedAtMs ?? now }
              : row,
          ),
        );
      }
      return { previous };
    },
    onError: (_error, _taskId, context) => {
      if (context?.previous) queryClient.setQueryData(MY_TASKS_QUERY_KEY, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
