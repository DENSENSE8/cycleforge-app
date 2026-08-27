'use client';

/**
 * Support `/support?ticket=` paint-pending — workspace, board, and recent rail
 * share one pending (`shareKey`) so open paints in the click commit.
 */

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOptimisticUrlParam } from '@/hooks/useOptimisticUrlParam';

const SUPPORT_PATH = '/support';

function parseTicketId(raw: string | null): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function useSupportTicketParam(): {
  ticketId: number | null;
  setTicket: (next: number | null) => void;
  /** Paint without replace — multi-field clears that also drop `ticket`. */
  paintTicket: (next: number | null) => void;
} {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlTicket = useMemo(
    () => parseTicketId(searchParams.get('ticket')),
    [searchParams],
  );

  const replace = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      // Tickets is the default mode — drop stale `mode=` if present.
      params.delete('mode');
      mutate(params);
      const qs = params.toString();
      router.replace(qs ? `${SUPPORT_PATH}?${qs}` : SUPPORT_PATH, { scroll: false });
    },
    [router, searchParams],
  );

  const write = useCallback((params: URLSearchParams, next: number | null) => {
    if (next != null && next > 0) params.set('ticket', String(next));
    else params.delete('ticket');
  }, []);

  const { value, setValue, paint } = useOptimisticUrlParam<number | null>({
    urlValue: urlTicket,
    replace,
    write,
    shareKey: 'support:ticket',
  });

  return { ticketId: value, setTicket: setValue, paintTicket: paint };
}
