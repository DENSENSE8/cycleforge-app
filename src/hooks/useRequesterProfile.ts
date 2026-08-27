'use client';

import { useQuery } from '@tanstack/react-query';
import type { RequesterProfile } from '@/lib/support/requester-profile';

/**
 * Who opened this ticket, for the thread's `RequesterDetailBand`.
 *
 * Deliberately a SEPARATE query from the ticket bundle and the support-context
 * bundle: it reaches the helpdesk search API, which is the slowest and the most
 * rate-limited thing on this surface. Folding it into either bundle would make
 * the conversation wait on a customer's ticket count.
 */
export function useRequesterProfile(ticketId: number | null | undefined, enabled = true) {
  return useQuery<RequesterProfile, Error>({
    queryKey: ['support-requester', ticketId ?? null],
    enabled: enabled && Number.isFinite(ticketId) && (ticketId as number) > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await fetch(`/api/support/requester?ticketId=${ticketId}`, {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `support/requester ${res.status}`);
      }
      return data.profile as RequesterProfile;
    },
  });
}
