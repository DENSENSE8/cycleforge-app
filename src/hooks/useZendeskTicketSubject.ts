'use client';

import { useQuery } from '@tanstack/react-query';

/** Lazily resolve a Zendesk ticket's subject (title) by id, for labeling claim folders in the photo library. */
export function useZendeskTicketSubject(ticketId: number | null | undefined) {
  return useQuery({
    queryKey: ['zendesk-ticket-subject', ticketId] as const,
    enabled: typeof ticketId === 'number' && Number.isFinite(ticketId) && ticketId > 0,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async () => {
      const res = await fetch(`/api/zendesk/tickets/${ticketId}`);
      if (res.status === 429 || res.status === 503) return null;
      if (!res.ok) return null;
      const data = (await res.json().catch(() => null)) as
        | { ticket?: { subject?: string | null } }
        | null;
      const subject = data?.ticket?.subject?.trim();
      return subject || null;
    },
  });
}
