'use client';

/** The signed-in staffer's unread `staff_inbox_items` (`GET /api/inbox?filter=unread`) — one query every surface shares. */

import { useQuery } from '@tanstack/react-query';

import { WORK_TASK_FOLLOW_UP_ALERT } from './event-vocabulary';
import type { InboxFeedDto, InboxItemDto } from './types';

/** The Ably `inbox_item` arm in ActivityInboxContext invalidates this key. */
export const DURABLE_INBOX_QUERY_KEY = ['api-inbox'] as const;

async function fetchDurableInbox(): Promise<InboxItemDto[]> {
  // 404 is the org running with the Home Inbox flag off — a silent empty
  // list, never an error: every surface works without it.
  const res = await fetch('/api/inbox?filter=unread', { cache: 'no-store' });
  if (!res.ok) return [];
  const feed = (await res.json()) as InboxFeedDto;
  return feed.items ?? [];
}

export function useDurableInbox({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: DURABLE_INBOX_QUERY_KEY,
    queryFn: fetchDurableInbox,
    staleTime: 15_000,
    enabled,
  });
}

/** Unread follow-up alerts, newest first (the feed's own order). */
export function useFollowUpAlerts({ enabled = true }: { enabled?: boolean } = {}): InboxItemDto[] {
  const { data = [] } = useDurableInbox({ enabled });
  return data.filter((item) => item.eventKey === WORK_TASK_FOLLOW_UP_ALERT);
}

/** "by Oct 1, 5:00 PM" (warehouse time) — how every alert surface prints its follow-up-by. */
export function followUpDueLabel(dueAt: string | null): string | null {
  if (!dueAt) return null;
  const ms = Date.parse(dueAt);
  if (!Number.isFinite(ms)) return null;
  return `by ${new Date(ms).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}
