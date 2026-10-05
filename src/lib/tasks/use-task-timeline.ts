'use client';

/**
 * The open task's merged Timeline — follow-ups (`useTaskFollowUps`) and the
 * task's audit + alerts (`GET /api/tasks/[id]/timeline`) through the
 * pure `taskTimelineItems`. Zero provider reads: the Timeline never reaches a
 * helpdesk. One hook for the desk rail and the phone sheet, so both paint the
 * same rows.
 */

import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTaskFollowUps } from './use-task-workspace';
import { taskTimelineItems, type TaskTimelineItem, type TaskTimelinePayload } from './task-timeline';

/** The audit half's cache key; an alert send invalidates it (TaskAlertButton). */
export function taskTimelineQueryKey(taskId: number | null) {
  return ['tasks', 'timeline', taskId] as const;
}

export function useTaskTimeline(taskId: number | null) {
  const queryClient = useQueryClient();
  const { followUps, loading: followUpsLoading } = useTaskFollowUps(taskId);
  const history = useQuery({
    queryKey: taskTimelineQueryKey(taskId),
    enabled: taskId != null,
    queryFn: async (): Promise<TaskTimelinePayload> => {
      const res = await fetch(`/api/tasks/${taskId}/timeline`, { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as Partial<TaskTimelinePayload> & { error?: string };
      if (!res.ok || data.ok !== true) throw new Error(data.error || `Request failed (${res.status})`);
      return data as TaskTimelinePayload;
    },
  });

  // Every desk write (status, owners, due) settles by re-reading `['tasks', 'desk']`;
  // when that read lands, the audit half re-reads too so the edit shows on the hairline.
  useEffect(() => {
    if (taskId == null) return;
    return queryClient.getQueryCache().subscribe((event) => {
      const key = event.query.queryKey;
      if (event.type === 'updated' && event.action.type === 'success' && key[0] === 'tasks' && key[1] === 'desk') {
        void queryClient.invalidateQueries({ queryKey: taskTimelineQueryKey(taskId) });
      }
    });
  }, [queryClient, taskId]);

  const items = useMemo<TaskTimelineItem[]>(
    () =>
      taskTimelineItems({
        followUps,
        audit: history.data?.audit ?? [],
        alerts: history.data?.alerts ?? [],
        staffNames: history.data?.staffNames,
      }),
    [followUps, history.data],
  );

  return { items, loading: followUpsLoading || history.isLoading };
}
