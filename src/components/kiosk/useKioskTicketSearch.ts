'use client';

/** Kiosk ticket search — the device-principal adapter over the shared {@link useTicketSearch}. */

import {
  useTicketSearch,
  type UseTicketSearch,
} from '@/components/support/link/useTicketSearch';
import { kioskFetchHealed } from '@/lib/kiosk/kiosk-self-heal';

type UseKioskTicketSearch = UseTicketSearch;

export function useKioskTicketSearch({ enabled }: { enabled: boolean }): UseKioskTicketSearch {
  return useTicketSearch({
    // The step IS the surface — there is no host modal to be closed, so `open`
    // and `enabled` are the same fact: the link face is showing.
    open: enabled,
    enabled,
    buildUrl: (query) => {
      const params = new URLSearchParams();
      if (query) params.set('query', query);
      const search = params.toString();
      return `/api/kiosk/repair/ticket-candidates${search ? `?${search}` : ''}`;
    },
    fetcher: (url, init) => kioskFetchHealed(url, { ...init, credentials: 'include' }),
  });
}
