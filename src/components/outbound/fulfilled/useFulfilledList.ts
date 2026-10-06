'use client';

/**
 * Fulfilled's records — `GET /api/nav/fulfilled` over the view's URL
 * (`fulfilledApiParams`: date axis + window, channel, carrier, packer, scan
 * source, sort, Find, and the grain on the sheet — the board is always order
 * grain) — as `LocatedRecords`, the shape the shared sheet (`PastedListSheet`),
 * its status chips and the board (`FulfilledBoard`) read, plus when the
 * answer last arrived (the board's freshness dot). The status chips
 * (`?status=`) narrow the answer here, client-side, so they count the whole
 * window; the board reads every entry and ignores them. The twin of
 * `usePurchasesList`.
 */

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { fetchNavFulfilled } from '@/lib/nav/context/http-client';
import type { NavFulfilledResponse } from '@/lib/nav/context/schema';
import { useNavStaffKey } from '@/lib/nav/context/use-nav-staff-key';
import type { BulkEntry, LocatedRecords } from '@/lib/nav/locate/use-bulk-list';
import { FULFILLED_FIND_PARAM, FULFILLED_STATUS_PARAM, fulfilledApiParams } from '@/lib/outbound/fulfilled-params';
import { useReplaceSearchParams } from '@/components/sidebar/contextual/useReplaceSearchParams';

const NO_REPEATS: ReadonlyMap<string, number> = new Map();

/** The React Query root every Fulfilled read is keyed under — a re-poll invalidates it. */
export const NAV_FULFILLED_QUERY_ROOT = 'nav-fulfilled';

export interface FulfilledList extends LocatedRecords {
  /** When the answer last arrived (epoch ms; 0 before the first). */
  updatedAt: number;
  /** Per-carrier poll health (the board's "sync failing" line); null before the first answer. */
  syncHealth: NavFulfilledResponse['syncHealth'] | null;
}

export function useFulfilledList(): FulfilledList {
  const searchParams = useSearchParams();
  const replace = useReplaceSearchParams();
  const staffKey = useNavStaffKey();
  const viewerStaffId = useAuth().user?.staffId ?? null;
  const search = searchParams?.toString() ?? '';
  const api = useMemo(() => {
    const url = new URLSearchParams(search);
    return fulfilledApiParams(url, url.get(FULFILLED_FIND_PARAM) ?? '', viewerStaffId);
  }, [search, viewerStaffId]);
  const apiKey = api.toString();
  const query = useQuery({
    queryKey: [NAV_FULFILLED_QUERY_ROOT, staffKey, apiKey],
    queryFn: ({ signal }) => fetchNavFulfilled(api, signal),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const entries = useMemo(
    () => (query.data?.entries ?? []).map((entry): BulkEntry => ({ ...entry, pending: false })),
    [query.data],
  );
  const buckets = useMemo(() => query.data?.buckets ?? [], [query.data]);
  const rawStatus = searchParams?.get(FULFILLED_STATUS_PARAM)?.trim() || null;
  // A filter naming no bucket filters nothing.
  const status = rawStatus && buckets.some((bucket) => bucket.id === rawStatus) ? rawStatus : null;
  const setStatus = useCallback(
    (next: string | null) =>
      replace((params) => {
        if (next) params.set(FULFILLED_STATUS_PARAM, next);
        else params.delete(FULFILLED_STATUS_PARAM);
      }),
    [replace],
  );
  const refetch = query.refetch;
  return {
    scope: 'outbound',
    loading: query.isFetching,
    error: query.error ? query.error.message || 'Could not read the fulfilled orders' : null,
    refetch: () => void refetch(),
    entries,
    buckets,
    status,
    setStatus,
    facet: null,
    // The query answers as a whole: asking again for one order re-reads the window.
    recheck: () => void refetch(),
    repeats: NO_REPEATS,
    updatedAt: query.dataUpdatedAt,
    syncHealth: query.data?.syncHealth ?? null,
  };
}
