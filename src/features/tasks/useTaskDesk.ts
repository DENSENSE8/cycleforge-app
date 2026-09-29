'use client';

/** Data + writes for the task desk — `work_assignments` rows handed to a person. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  sortTaskDeskRows,
  taskDeskRowFromWire,
  type TaskDeskLane,
  type TaskDeskListPayload,
  type TaskDeskRow,
  type TaskDeskStatus,
  type TaskDeskWireRow,
} from '@/lib/tasks/task-desk-row';

/** Lateness moves in minutes, not seconds — the old chip's cadence. */
const CLOCK_TICK_MS = 30_000;

/** The fields `PATCH /api/tasks/[id]` accepts. An unknown key is a 403 there. */
export interface TaskDeskPatch {
  status?: TaskDeskStatus;
  priority?: number;
  /** ISO string, or `null` to clear. */
  deadlineAt?: string | null;
  startedAt?: string | null;
  assigneeStaffId?: number;
  /** Replace the shared assignment membership (first member is the lead). */
  assigneeStaffIds?: number[];
  /** The umbrella project label; null clears it. */
  projectName?: string | null;
  /** The description staff work from; empty clears it. */
  note?: string | null;
  /** "Remind me" instant, ISO, or `null` to clear. */
  remindAt?: string | null;
}

/** WHOSE work the desk reads. */
export type TaskDeskScope = 'mine' | 'handed' | 'everyone';

const SCOPE_PARAMS: Readonly<Record<TaskDeskScope, Record<string, string>>> = {
  mine: { assignee: 'me' },
  handed: { assignee: 'all', assignedBy: 'me' },
  everyone: { assignee: 'all' },
};

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.ok === false) {
    throw new Error(String(data.error || `Request failed (${res.status})`));
  }
  return data;
}

/** Key + fetcher for one lane × scope of the desk — shared by the hook and WelcomeGate's welcome warm-up. */
export function taskDeskQueryOptions(lane: TaskDeskLane, scope: TaskDeskScope = 'mine') {
  return queryOptions({
    queryKey: ['tasks', 'desk', lane, scope] as const,
    queryFn: async (): Promise<TaskDeskWireRow[]> => {
      const params = new URLSearchParams({ lane, ...SCOPE_PARAMS[scope] });
      const res = await fetch(`/api/tasks?${params}`, { credentials: 'same-origin' });
      const data = (await readJson(res)) as unknown as TaskDeskListPayload;
      return data.tasks ?? [];
    },
    // No push channel carries task changes, so a refocus is the refresh — but
    // at most once a minute. `0` refetched the desk on every alt-tab, seconds
    // apart; every local write invalidates `['tasks', 'desk']` on settle.
    staleTime: 60_000,
  });
}

export function useTaskDesk(lane: TaskDeskLane, scope: TaskDeskScope = 'mine') {
  const queryClient = useQueryClient();

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const query = useQuery(taskDeskQueryOptions(lane, scope));

  const rows: TaskDeskRow[] = useMemo(
    () => sortTaskDeskRows((query.data ?? []).map(taskDeskRowFromWire)),
    [query.data],
  );

  /** Every lane of this desk, wherever it is cached. */
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['tasks', 'desk'] });
  }, [queryClient]);

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: TaskDeskPatch }) => {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(patch),
      });
      return readJson(res);
    },
    onSettled: refresh,
  });

  return {
    rows,
    nowMs,
    loading: query.isLoading,
    error: query.isError ? ((query.error as Error)?.message ?? 'Could not load tasks.') : null,
    refresh,
    update,
  };
}
