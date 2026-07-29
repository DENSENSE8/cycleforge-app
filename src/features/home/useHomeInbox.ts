'use client';

/**
 * Home Inbox data hook.
 *
 * Realtime is free here: the per-staff Ably channel already exists
 * (`org:{orgId}:inbox:{staffId}` — src/lib/realtime/channels.ts) and the token
 * endpoint already grants this staffer subscribe+publish on it, so the feed
 * invalidates on a server nudge instead of polling hard.
 */

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { InboxFeedDto, InboxTriageAction } from '@/lib/notifications/types';

export type InboxFilter = 'active' | 'unread' | 'done' | 'snoozed';

const INBOX_QUERY_KEY = ['home-inbox'] as const;

export class InboxDisabledError extends Error {}

async function fetchInbox(filter: InboxFilter): Promise<InboxFeedDto> {
  const res = await fetch(`/api/inbox?filter=${filter}`, {
    cache: 'no-store',
    credentials: 'include',
  });
  // 404 = the org has the Home Inbox flag off. A distinct error type so the
  // view can teach ("not enabled here") instead of showing a generic failure.
  if (res.status === 404) throw new InboxDisabledError('inbox disabled');
  if (!res.ok) throw new Error(`inbox ${res.status}`);
  return res.json();
}

export function useHomeInbox(filter: InboxFilter) {
  return useQuery({
    queryKey: [...INBOX_QUERY_KEY, filter],
    queryFn: () => fetchInbox(filter),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: (count, err) => !(err instanceof InboxDisabledError) && count < 2,
  });
}

/**
 * Triage a row. Optimistic with rollback (the house TanStack contract:
 * onMutate snapshot+apply → onError restore → onSettled invalidate), because
 * clearing an inbox is a rapid-fire action and a spinner per row is unusable.
 */
export function useInboxTriage(filter: InboxFilter) {
  const queryClient = useQueryClient();
  const key = [...INBOX_QUERY_KEY, filter];

  const mutation = useMutation({
    mutationFn: async (vars: { id: number; action: InboxTriageAction }) => {
      const res = await fetch(`/api/inbox/${vars.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: vars.action }),
      });
      if (!res.ok) throw new Error(`triage ${res.status}`);
      return res.json();
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<InboxFeedDto>(key);
      if (previous) {
        // 'read' keeps the row in place (it stays actionable); done/snooze
        // remove it from the active view.
        const removes = vars.action === 'done' || vars.action === 'snooze';
        queryClient.setQueryData<InboxFeedDto>(key, {
          ...previous,
          items: removes
            ? previous.items.filter((i) => i.id !== vars.id)
            : previous.items.map((i) =>
                i.id === vars.id
                  ? { ...i, state: vars.action === 'unread' ? 'unread' : 'read' }
                  : i,
              ),
          counts: {
            ...previous.counts,
            unread: Math.max(
              0,
              previous.counts.unread + (vars.action === 'unread' ? 1 : -1),
            ),
          },
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: INBOX_QUERY_KEY }),
  });

  const triage = useCallback(
    (id: number, action: InboxTriageAction) => mutation.mutate({ id, action }),
    [mutation],
  );

  return { triage, isPending: mutation.isPending };
}
