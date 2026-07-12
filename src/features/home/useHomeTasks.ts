'use client';

/**
 * Data layer for the Home "Tasks" mode (plan §6.2 / Phase B).
 *
 * Composes the existing ops-plans surface — never a new engine:
 *   - list  : GET /api/ops-plans/inbox            (perm operations.plans.view)
 *   - claim : POST /api/ops-plans/tasks/[id]/claim    (operations.plans.claim)
 *   - done  : POST /api/ops-plans/tasks/[id]/complete (manage | claim)
 *   - reopen: PATCH /api/ops-plans/tasks/[id] {status} (operations.plans.manage)
 *   - live  : org:{id}:ops_plans:changes → 'ops_plan.updated' invalidates
 *
 * The inbox merges plan tasks (and, when `isOpsPlansUnifiedInbox` is on, live
 * work-order queues) into one ranked `HomeTaskItem[]`. Work-order rows are
 * deep-linked (`sourcePath`); only `plan_task` rows carry claim/complete/reopen.
 */

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { getOpsPlansChannelName, safeChannelName } from '@/lib/realtime/channels';

export type HomeTaskSource = 'plan_task' | 'work_assignment';

export interface HomeTaskItem {
  source: HomeTaskSource;
  id: string;
  title: string;
  subtitle: string;
  status: string;
  assigneeStaffId: number | null;
  assigneeName: string | null;
  station: string | null;
  dueAt: string | null;
  priority: number;
  planId?: string;
  planTitle?: string;
  queueKey?: string;
  sourcePath?: string;
  rank: number;
}

export interface HomeTasksResponse {
  items: HomeTaskItem[];
  nextCursor: string | null;
  counts: { planTasks: number; workOrders: number };
}

export type HomeTasksScope = 'mine' | 'all';

/** Query key namespace — every Home inbox scope lives under this prefix so a
 *  single Ably event can invalidate them all. */
const HOME_TASKS_PREFIX = ['ops-plans', 'inbox', 'home'] as const;
export const homeTasksKey = (scope: HomeTasksScope) => [...HOME_TASKS_PREFIX, scope] as const;

async function fetchInbox(scope: HomeTasksScope): Promise<HomeTasksResponse> {
  const params = new URLSearchParams();
  if (scope === 'mine') params.set('staffId', 'mine');
  params.set('status', 'open');
  const res = await fetch(`/api/ops-plans/inbox?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`inbox request failed (${res.status})`);
  return res.json() as Promise<HomeTasksResponse>;
}

export function useHomeTasks(scope: HomeTasksScope) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: homeTasksKey(scope),
    queryFn: () => fetchInbox(scope),
    staleTime: 30_000,
  });

  // Live refresh: any plan/task mutation publishes 'ops_plan.updated' on the
  // org's ops_plans channel (same channel the Plans sidebar subscribes to).
  const channel = safeChannelName(() => (user ? getOpsPlansChannelName(user.organizationId) : ''));
  const onUpdated = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: HOME_TASKS_PREFIX });
  }, [queryClient]);
  useAblyChannel(channel, 'ops_plan.updated', onUpdated, !!channel);

  return query;
}

async function postTaskAction(taskId: string, action: 'claim' | 'complete'): Promise<void> {
  const res = await fetch(`/api/ops-plans/tasks/${taskId}/${action}`, { method: 'POST' });
  if (!res.ok) throw new Error(`${action} failed (${res.status})`);
}

async function patchTaskStatus(taskId: string, status: string): Promise<void> {
  const res = await fetch(`/api/ops-plans/tasks/${taskId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`update failed (${res.status})`);
}

export function useTaskActions() {
  const queryClient = useQueryClient();
  const invalidate = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: HOME_TASKS_PREFIX }),
    [queryClient],
  );
  const claim = useMutation({ mutationFn: (taskId: string) => postTaskAction(taskId, 'claim'), onSuccess: invalidate });
  const complete = useMutation({ mutationFn: (taskId: string) => postTaskAction(taskId, 'complete'), onSuccess: invalidate });
  const reopen = useMutation({ mutationFn: (taskId: string) => patchTaskStatus(taskId, 'open'), onSuccess: invalidate });
  return { claim, complete, reopen };
}
