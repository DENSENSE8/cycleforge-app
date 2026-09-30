'use client';

/** Send "follow up on this task" alerts — the one client for `POST /api/tasks/[id]/alerts` (desk and phone). */

import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { InboxContact } from '@/lib/notifications/types';
import { DURABLE_INBOX_QUERY_KEY } from '@/lib/notifications/use-durable-inbox';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { addDaysToDateKey, getCurrentPSTDateKey, warehouseCivilTimeToInstant } from '@/utils/date';
import { taskAlertContacts, type TaskAlertBody } from './task-alerts';
import { useTaskEmailRefs } from './use-task-email-refs';
import { useTaskLinks } from './use-task-workspace';

/**
 * The contacts an alert sent now would carry — the composer's preview, built
 * by the same `taskAlertContacts` the server stamps from the same rows.
 */
export function useTaskAlertContacts(taskId: number, anchorTicketNumber: number | null): InboxContact[] {
  const { links } = useTaskLinks(taskId);
  const { refs } = useTaskEmailRefs(taskId);
  return taskAlertContacts({ anchorTicketNumber, links, emailRefs: refs });
}

/** "Alert Michael and Ana to follow up" — the one headline the desk and the phone print; nobody yet asks who. */
export function taskAlertHeadline(names: readonly string[]): string {
  if (names.length === 0) return 'Pick who to alert';
  const who =
    names.length === 1
      ? names[0]
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names[0]}, ${names[1]} +${names.length - 2}`;
  return `Alert ${who} to follow up`;
}

/** The quick "follow up by" choices, warehouse time: end of today, or the morning a chase starts. */
const DUE_CHOICES = [
  { label: 'Today 5 PM', days: 0, time: '17:00' },
  { label: 'Tomorrow', days: 1, time: '09:00' },
  { label: 'In 3 days', days: 3, time: '09:00' },
] as const;

export function taskAlertDueChoices(): { label: string; iso: string }[] {
  const today = getCurrentPSTDateKey();
  return DUE_CHOICES.flatMap(({ label, days, time }) => {
    const iso = warehouseCivilTimeToInstant(addDaysToDateKey(today, days), time)?.toISOString();
    return iso ? [{ label, iso }] : [];
  });
}

export interface TaskAlertResponse {
  ok: true;
  staffIds: number[];
  itemIds: number[];
  idempotent?: boolean;
}

export function useSendTaskAlert(taskId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: Omit<TaskAlertBody, 'clientEventId'>): Promise<TaskAlertResponse> => {
      const res = await fetch(`/api/tasks/${taskId}/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // One id per press: a retried POST is a no-op server-side.
        body: JSON.stringify({ ...body, clientEventId: safeRandomUUID() }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | TaskAlertResponse | null;
      if (!res.ok || !json || !('ok' in json)) {
        const refusal = json && 'error' in json ? json.error : null;
        throw new Error(
          refusal === 'no_recipients'
            ? 'Pick someone to alert.'
            : refusal === 'cannot_alert_self'
              ? 'You can’t alert yourself — pick someone else.'
              : 'Could not send the alert.',
        );
      }
      return json;
    },
    onSuccess: () => {
      // The inbox tallies what the sender has on hand; the task's Timeline shows the alert.
      void queryClient.invalidateQueries({ queryKey: DURABLE_INBOX_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['tasks', 'timeline', taskId] });
    },
  });
}
