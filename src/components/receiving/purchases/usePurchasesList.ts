'use client';

/**
 * Receiving › Purchasing's records — `GET /api/nav/purchases` over the view's
 * URL (`purchasesApiParams`: date axis + window, source, vendor, who
 * unboxed, sort, Find) — as `LocatedRecords`, the shape the shared sheet
 * (`PastedListSheet`) and its status chips read. The status chips (`?recon=`)
 * narrow the answer here, client-side, so they count the whole window.
 */

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { NAV_LOCATE_NOWHERE } from '@/lib/nav/context/schema';
import { fetchNavPurchases } from '@/lib/nav/context/http-client';
import { useNavStaffKey } from '@/lib/nav/context/use-nav-staff-key';
import type { BulkEntry, LocatedRecords } from '@/lib/nav/locate/use-bulk-list';
import { INBOUND_FIND_PARAM } from '@/lib/receiving/inbound-lane';
import { PURCHASES_STATUS_PARAM, purchasesApiParams } from '@/lib/receiving/purchases-params';
import { useReplaceSearchParams } from '@/components/sidebar/contextual/useReplaceSearchParams';

const NO_REPEATS: ReadonlyMap<string, number> = new Map();

export function usePurchasesList(): LocatedRecords {
  const searchParams = useSearchParams();
  const replace = useReplaceSearchParams();
  const staffKey = useNavStaffKey();
  const search = searchParams?.toString() ?? '';
  const api = useMemo(() => {
    const url = new URLSearchParams(search);
    return purchasesApiParams(url, url.get(INBOUND_FIND_PARAM) ?? '');
  }, [search]);
  const apiKey = api.toString();
  const query = useQuery({
    queryKey: ['nav-purchases', staffKey, apiKey],
    queryFn: ({ signal }) => fetchNavPurchases(api, signal),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const entries = useMemo(
    () => (query.data?.entries ?? []).map((entry): BulkEntry => ({ ...entry, pending: false })),
    [query.data],
  );
  const buckets = useMemo(() => query.data?.buckets ?? [], [query.data]);
  const rawStatus = searchParams?.get(PURCHASES_STATUS_PARAM)?.trim() || null;
  // A filter naming no bucket filters nothing; Not found is always a filter.
  const status =
    rawStatus && (rawStatus === NAV_LOCATE_NOWHERE || buckets.some((bucket) => bucket.id === rawStatus)) ? rawStatus : null;
  const setStatus = useCallback(
    (next: string | null) =>
      replace((params) => {
        if (next) params.set(PURCHASES_STATUS_PARAM, next);
        else params.delete(PURCHASES_STATUS_PARAM);
      }),
    [replace],
  );
  const refetch = query.refetch;
  return {
    scope: 'inbound',
    loading: query.isFetching,
    error: query.error ? query.error.message || 'Could not read the purchases' : null,
    refetch: () => void refetch(),
    entries,
    buckets,
    status,
    setStatus,
    facet: null,
    // The query answers as a whole: asking again for one purchase re-reads the window.
    recheck: () => void refetch(),
    repeats: NO_REPEATS,
  };
}
