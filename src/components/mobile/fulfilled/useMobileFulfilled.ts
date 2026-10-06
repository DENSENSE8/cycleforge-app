'use client';

/**
 * The phone's read of Fulfilled: the SAME `GET /api/nav/fulfilled` the desk
 * reads (`fetchNavFulfilled`, parsed by `NavFulfilledResponseSchema`), at the
 * view's defaults — order grain, default window, no filters. The desk hook is
 * bound to the desk URL (status chips, Find), so the phone keeps its own.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchNavFulfilled } from '@/lib/nav/context/http-client';
import { useNavStaffKey } from '@/lib/nav/context/use-nav-staff-key';
import { fulfilledApiParams } from '@/lib/outbound/fulfilled-params';

export function useMobileFulfilled() {
  const staffKey = useNavStaffKey();
  const api = fulfilledApiParams(new URLSearchParams(), '');
  return useQuery({
    queryKey: ['nav-fulfilled', staffKey, api.toString()],
    queryFn: ({ signal }) => fetchNavFulfilled(api, signal),
    staleTime: 30_000,
  });
}
