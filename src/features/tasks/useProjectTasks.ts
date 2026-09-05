'use client';

/**
 * Org project tasks for Home → Tasks — `ops_plan_tasks` via /api/ops-plans/tasks.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OpsPlanTaskStatus } from '@/lib/ops-plans/constants';
import type { PlanRow, TaskRow } from '@/lib/ops-plans/types';

export type TasksDeskLane = 'open' | 'done' | 'canceled';
export type TasksDeskScope = 'mine' | 'all';

const TASKS_KEY = ['ops-plan-tasks'] as const;
const PLANS_KEY = ['ops-plans'] as const;

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function mergeTaskIntoList(old: unknown, task: TaskRow): unknown {
  if (!Array.isArray(old)) return old;
  const list = old as TaskRow[];
  if (list.some((row) => row.id === task.id)) {
    return list.map((row) => (row.id === task.id ? task : row));
  }
  return [task, ...list];
}

function newerTask(a: TaskRow, b: TaskRow): TaskRow {
  const aMs = Date.parse(a.updatedAt) || 0;
  const bMs = Date.parse(b.updatedAt) || 0;
  return aMs >= bMs ? a : b;
}

function listCaughtUp(over: TaskRow, listRow: TaskRow): boolean {
  const listMs = Date.parse(listRow.updatedAt) || 0;
  const overMs = Date.parse(over.updatedAt) || 0;
  if (listMs < overMs) return false;
  return (
    listRow.assigneeStaffId === over.assigneeStaffId &&
    listRow.status === over.status &&
    listRow.title === over.title
  );
}

function pruneOverlay(
  prev: Record<string, TaskRow>,
  source: TaskRow[],
  trustList: boolean,
): Record<string, TaskRow> {
  const byId = new Map(source.map((row) => [row.id, row]));
  let changed = false;
  const next: Record<string, TaskRow> = {};
  for (const [id, over] of Object.entries(prev)) {
    const row = byId.get(id);
    if (!row) {
      if (trustList) {
        changed = true;
        continue;
      }
      next[id] = over;
      continue;
    }
    const listMs = Date.parse(row.updatedAt) || 0;
    const overMs = Date.parse(over.updatedAt) || 0;
    if (trustList && (listMs > overMs || listCaughtUp(over, row))) {
      changed = true;
      continue;
    }
    next[id] = over;
  }
  return changed ? next : prev;
}

export function useProjectTasks(opts: {
  lane: TasksDeskLane;
  scope: TasksDeskScope;
  planId: string | null;
  query: string;
  enabled: boolean;
}) {
  const queryClient = useQueryClient();
  const [overlay, setOverlay] = useState<Record<string, TaskRow>>({});
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: TASKS_KEY });
    void queryClient.invalidateQueries({ queryKey: PLANS_KEY });
  }, [queryClient]);

  const listKey = [...TASKS_KEY, opts.lane, opts.scope, opts.planId, opts.query] as const;
  const list = useQuery({
    queryKey: listKey,
    enabled: opts.enabled,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('status', opts.lane);
      params.set('scope', opts.scope);
      if (opts.planId) params.set('planId', opts.planId);
      if (opts.query.trim()) params.set('q', opts.query.trim());
      const res = await fetch(`/api/ops-plans/tasks?${params.toString()}`, { cache: 'no-store' });
      const body = await readJson<{ tasks: TaskRow[] }>(res);
      return body.tasks;
    },
  });

  const plans = useQuery({
    queryKey: PLANS_KEY,
    enabled: opts.enabled,
    queryFn: async () => {
      const res = await fetch('/api/ops-plans');
      const body = await readJson<{ plans: PlanRow[] }>(res);
      return body.plans;
    },
  });

  const writeTaskIntoLists = useCallback(
    (task: TaskRow) => {
      setOverlay((prev) => {
        const current = prev[task.id];
        return { ...prev, [task.id]: current ? newerTask(current, task) : task };
      });
      queryClient.setQueryData(listKey, (old: unknown) => mergeTaskIntoList(old, task));
      queryClient.setQueriesData({ queryKey: TASKS_KEY }, (old: unknown) => mergeTaskIntoList(old, task));
    },
    [queryClient, listKey],
  );

  const patchTask = useMutation({
    mutationFn: async ({
      taskId,
      body,
    }: {
      taskId: string;
      body: { status?: OpsPlanTaskStatus; assigneeStaffId?: number | null; title?: string };
    }) => {
      const res = await fetch(`/api/ops-plans/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return readJson<{ task: TaskRow; planId: string }>(res);
    },
    onSuccess: (result) => writeTaskIntoLists(result.task),
    onSettled: refresh,
  });

  const completeTask = useMutation({
    mutationFn: async (taskId: string) => {
      const res = await fetch(`/api/ops-plans/tasks/${taskId}/complete`, { method: 'POST' });
      return readJson<{ task: TaskRow; planId: string }>(res);
    },
    onSuccess: (result) => writeTaskIntoLists(result.task),
    onSettled: refresh,
  });

  const claimTask = useMutation({
    mutationFn: async (taskId: string) => {
      const res = await fetch(`/api/ops-plans/tasks/${taskId}/claim`, { method: 'POST' });
      return readJson<{ task: TaskRow; planId: string }>(res);
    },
    onSuccess: (result) => writeTaskIntoLists(result.task),
    onSettled: refresh,
  });

  const createTask = useMutation({
    mutationFn: async (input: { planId: string; title: string; assigneeStaffId?: number | null }) => {
      const res = await fetch('/api/ops-plans/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      return readJson<{ task: TaskRow; planId: string }>(res);
    },
    onSuccess: (result) => writeTaskIntoLists(result.task),
    onSettled: refresh,
  });

  const createPlan = useMutation({
    mutationFn: async (input: { title: string }) => {
      const res = await fetch('/api/ops-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      return readJson<{ plan: PlanRow }>(res);
    },
    onSettled: refresh,
  });

  useEffect(() => {
    const source = list.data ?? [];
    setOverlay((prev) => pruneOverlay(prev, source, !list.isFetching));
  }, [list.data, list.isFetching]);

  const rows = useMemo(() => {
    const source = list.data ?? [];
    if (Object.keys(overlay).length === 0) return source;
    return source.map((row) => {
      const over = overlay[row.id];
      return over ? newerTask(over, row) : row;
    });
  }, [list.data, overlay]);

  return {
    rows,
    plans: plans.data ?? [],
    loading: list.isLoading || plans.isLoading,
    isError: list.isError || plans.isError,
    pending:
      patchTask.isPending ||
      completeTask.isPending ||
      claimTask.isPending ||
      createTask.isPending ||
      createPlan.isPending,
    createPending: createTask.isPending || createPlan.isPending,
    refresh,
    patch: patchTask.mutateAsync,
    complete: completeTask.mutateAsync,
    claim: claimTask.mutateAsync,
    createTask: createTask.mutateAsync,
    createPlan: createPlan.mutateAsync,
  };
}
