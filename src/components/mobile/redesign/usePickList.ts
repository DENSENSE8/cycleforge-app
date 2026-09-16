'use client';

/**
 * Pick list for `/m/pick`.
 *
 * One fetch per scope, keyed by scope, because the API answers the scope
 * question server-side (the picker's staff id comes from the session, not the
 * URL) — filtering a single "all" response on the client would show a picker
 * rows the server deliberately withheld.
 *
 * `cache: 'no-store'` matches the orders feeds in `dashboard-table-data.ts`: an
 * allocation created thirty seconds ago must not be served from the HTTP cache
 * to someone standing at the shelf.
 */

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  normalizePickListPayload,
  type PickList,
  type PickListScope,
} from '@/components/mobile/redesign/pick-list-payload';

const FRESH_FETCH_OPTIONS: RequestInit = { cache: 'no-store' };

async function fetchPickList(scope: PickListScope): Promise<PickList> {
  const res = await fetch(`/api/picking/list?scope=${encodeURIComponent(scope)}`, FRESH_FETCH_OPTIONS);
  if (!res.ok) throw new Error(`Failed to fetch the pick list (${res.status})`);
  return normalizePickListPayload(await res.json(), scope);
}

export function usePickList(scope: PickListScope): UseQueryResult<PickList> {
  return useQuery({
    queryKey: ['picking', 'list', scope],
    queryFn: () => fetchPickList(scope),
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    // Switching scope keeps the previous list on screen: a queue that blanks on
    // every tab tap reads as a load failure to someone holding a scanner.
    placeholderData: keepPreviousData,
  });
}

export interface AllocationSweepResult {
  inserted: number;
}

/**
 * Run the allocator over every unallocated order in the org — `POST
 * /api/allocation/auto` with no body, the door its docblock describes as
 * *"the door an operator uses when the pick list looks short"*.
 *
 * It lives beside {@link usePickList} because the two share one query key: the
 * sweep's whole purpose is to move rows out of the shortfall band and into the
 * walkable list, so it must invalidate the list it just changed. A caller that
 * forgot would leave the operator staring at the band they just cleared.
 *
 * Not optimistic. The allocator decides which unit fills which line by grade
 * tier and shelf, and guessing that on the phone would paint a unit the server
 * then refuses.
 */
export function useAllocationSweep(): UseMutationResult<AllocationSweepResult, Error, void> {
  const queryClient = useQueryClient();
  return useMutation<AllocationSweepResult, Error, void>({
    mutationFn: async () => {
      const res = await fetch('/api/allocation/auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        cache: 'no-store',
      });
      const body = (await res.json().catch(() => null)) as
        | { inserted?: unknown; error?: unknown }
        | null;
      if (!res.ok) {
        const message = typeof body?.error === 'string' ? body.error : `Allocation failed (${res.status})`;
        throw new Error(message);
      }
      const inserted = Number(body?.inserted);
      return { inserted: Number.isFinite(inserted) && inserted > 0 ? Math.trunc(inserted) : 0 };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['picking', 'list'] });
    },
  });
}
