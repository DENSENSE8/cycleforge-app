'use client';

/**
 * Fulfilled's lines — `GET /api/nav/fulfilled` over the view's URL
 * (`fulfilledApiParams`: date axis + window, platform, carrier, packer, scan
 * source, sort, Find) — as `LocatedRecords`: the shipped orders' Records
 * lines, each carrying its order's journey. The board (`FulfilledBoard`,
 * one card per order) and the Records sheet (`RecordsSheetBody`, one row per
 * line, the whole window or one bucket) read the same answer, so a column's
 * count and its zoomed rows never disagree. Plus when the answer last
 * arrived (the board's freshness dot) and the carrier sync health.
 */

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { fetchNavFulfilled } from '@/lib/nav/context/http-client';
import type { NavFulfilledResponse } from '@/lib/nav/context/schema';
import { useNavStaffKey } from '@/lib/nav/context/use-nav-staff-key';
import type { BulkEntry, LocatedRecords } from '@/lib/nav/locate/use-bulk-list';
import { FULFILLED_FIND_PARAM, fulfilledApiParams } from '@/lib/outbound/fulfilled-params';

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
  // A write changes the counts too: the sidebar's facets (NavFilters, `nav-facets`) re-read with the rows.
  const queryClient = useQueryClient();
  const rowsRefetch = query.refetch;
  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['nav-facets'] });
    void rowsRefetch();
  }, [queryClient, rowsRefetch]);
  return {
    scope: 'outbound',
    loading: query.isFetching,
    error: query.error ? query.error.message || 'Could not read the fulfilled orders' : null,
    refetch,
    entries,
    buckets,
    // The bucket is the URL's `?col=`, narrowed by the page — never the sheet's chip row.
    status: null,
    setStatus: () => undefined,
    facet: null,
    // The query answers as a whole: asking again for one order re-reads the window.
    recheck: refetch,
    repeats: NO_REPEATS,
    updatedAt: query.dataUpdatedAt,
    syncHealth: query.data?.syncHealth ?? null,
  };
}
