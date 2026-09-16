'use client';

/**
 * Kiosk ticket search — the device-principal adapter over the shared
 * {@link useTicketSearch}.
 *
 * Sibling of `useClaimTicketSearch` (the receiving claim flow's adapter). The
 * ONLY kiosk-specific parts are the URL and the transport:
 *
 * - **URL:** `/api/kiosk/repair/ticket-candidates`, the `withKioskAuth` read
 *   sibling. The staff waist (`/api/support/tickets/link`) is `withAuth` +
 *   `integrations.zendesk` and 401s on a tablet — the same trap the per-SKU
 *   reason vocabulary hit before `/api/kiosk/repair/issues` existed.
 * - **Transport:** `kioskFetchHealed`, because a device cookie can be stale
 *   after another surface re-bound the row and production has no server-side
 *   re-bind.
 *
 * There is no anchor to resolve: the `repair_service` row is written when the
 * cart submits, so the route asks for candidates against the unsaved-repair
 * anchor and nothing reads back as already linked. See that route's docblock.
 *
 * Callers: `KioskTicketStep`.
 * Affected API: GET `/api/kiosk/repair/ticket-candidates`. Schemas: none.
 */

import {
  useTicketSearch,
  type UseTicketSearch,
} from '@/components/support/link/useTicketSearch';
import { kioskFetchHealed } from '@/lib/kiosk/kiosk-self-heal';

export type UseKioskTicketSearch = UseTicketSearch;

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
