'use client';

import { useQuery } from '@tanstack/react-query';

export const threadKey = (ticketId: number) => ['receiving', 'ticket-thread', ticketId] as const;

export interface ThreadComment {
  id: number;
  body: string;
  public: boolean;
  createdAt: string;
  authorId: number;
}

export interface ThreadResult {
  ticket: {
    id: number;
    subject: string | null;
    status: string;
    priority: string | null;
    url: string | null;
    requesterEmail: string | null;
  };
  comments: ThreadComment[];
}

export function useTicketThread(ticketId: number | null, enabled: boolean = true) {
  return useQuery<ThreadResult, Error>({
    queryKey: threadKey(ticketId ?? 0),
    queryFn: async () => {
      const res = await fetch(`/api/receiving/zendesk-claim/thread?ticketId=${ticketId}`, {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      return {
        ticket: {
          id: data.ticket.id,
          subject: data.ticket.subject ?? null,
          status: String(data.ticket.status ?? ''),
          priority: data.ticket.priority ?? null,
          url: data.ticket.url ?? null,
          requesterEmail: data.ticket.requesterEmail ?? null,
        },
        comments: data.comments,
      } as ThreadResult;
    },
    enabled: enabled && !!ticketId,
    staleTime: 30_000,
    retry: false,
  });
}
