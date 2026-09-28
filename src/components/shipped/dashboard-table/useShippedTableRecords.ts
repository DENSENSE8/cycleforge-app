'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEventBridge } from '@/hooks';
import { dashboardShippedQuery, dashboardShippedWeekQuery, SHIPPED_WEEK_PAGE_SIZE } from '@/lib/queries/dashboard-queries';
import { fetchShippedHydration } from '@/lib/dashboard-table-data';
import { useShippedWeekBuckets } from './useShippedWeekBuckets';
import { getRecentWeekBuckets } from '@/lib/dashboard-week-range';
import { toPSTDateKey } from '@/utils/date';
import { shippedStampInWindow } from '@/lib/shipping/shipped-filter/shipped-filter-params';
import {
  dedupeShippedRecords,
  deriveShippedRecord,
  isShippedDeskRow,
  type DerivedPackerRecord,
} from '@/lib/shipped-records';
import type { ShippedTableFilters } from './useShippedTableFilters';

// Spine-first render (immediate paint):
const SPINE_FIRST = process.env.NEXT_PUBLIC_SHIPPED_SPINE_FIRST === 'true';
const SHIPPED_PHASE: 'spine' | 'full' = SPINE_FIRST ? 'spine' : 'full';

/** Fetches the shipped records (week buckets or all-time) with the view filters answered server-side, applies the outbound-state (`ostatus`) filter, and attaches… */
export function useShippedTableRecords(filters: ShippedTableFilters) {
  const {
    effectiveWeekStart,
    effectiveWeekEnd,
    effPackedBy,
    effStaffId,
    effPickedBy,
    shippedTime,
    shippedInstantWindow,
    shippedFilter,
    exceptionsOnly,
    carrierFilter,
    statusFilter,
    matchesOutbound,
    normalizedSearch,
  } = filters;

  const queryClient = useQueryClient();

  // Bucketed week cache:
  const allTimeMode = !effectiveWeekStart || !effectiveWeekEnd;

  /* "Load more" paging: */
  const [pageMultiplier, setPageMultiplier] = useState(1);
  const fetchLimit = pageMultiplier * SHIPPED_WEEK_PAGE_SIZE;
  useEffect(() => {
    setPageMultiplier(1);
  }, [
    effectiveWeekStart,
    effectiveWeekEnd,
    effPackedBy,
    effStaffId,
    shippedFilter,
    carrierFilter,
    statusFilter,
    exceptionsOnly,
    shippedTime,
    effPickedBy,
    normalizedSearch,
  ]);
  const loadMore = useCallback(() => setPageMultiplier((m) => m + 1), []);

  const weekBuckets = useShippedWeekBuckets({
    rangeStart: effectiveWeekStart,
    rangeEnd: effectiveWeekEnd,
    packedBy: effPackedBy,
    staffId: effStaffId ?? undefined,
    shippedFilter,
    carrier: carrierFilter,
    statusCategory: statusFilter,
    exceptionsOnly,
    shippedTime,
    pickedBy: effPickedBy,
    searchTerm: normalizedSearch,
    enabled: !allTimeMode,
    limit: fetchLimit,
    phase: SHIPPED_PHASE,
  });

  const allTimeQuery = useQuery({
    ...dashboardShippedQuery({
      weekStart: '',
      weekEnd: '',
      packedBy: effPackedBy,
      staffId: effStaffId ?? undefined,
      shippedFilter,
      carrier: carrierFilter,
      statusCategory: statusFilter,
      exceptionsOnly,
      shippedTime,
      pickedBy: effPickedBy,
      searchTerm: normalizedSearch,
      limit: fetchLimit,
      phase: SHIPPED_PHASE,
    }),
    enabled: allTimeMode,
    placeholderData: (previousData) => previousData,
  });

  // Unified loading/fetching surface for the active source (the consumer only
  // reads these two flags).
  const query = {
    isLoading: allTimeMode ? allTimeQuery.isLoading : weekBuckets.isLoading,
    isFetching: allTimeMode ? allTimeQuery.isFetching : weekBuckets.isFetching,
  };

  // Warm the cache on idle so the common period presets (this/last week) resolve INSTANTLY instead of cold-fetching on click.
  useEffect(() => {
    const warm = () => {
      for (const { weekStart, weekEnd } of getRecentWeekBuckets(2)) {
        void queryClient.prefetchQuery(
          dashboardShippedWeekQuery({
            weekStart,
            weekEnd,
            packedBy: effPackedBy,
            staffId: effStaffId ?? undefined,
            shippedFilter,
            carrier: carrierFilter,
            statusCategory: statusFilter,
            exceptionsOnly,
            pickedBy: effPickedBy,
            phase: SHIPPED_PHASE,
          }),
        );
      }
    };
    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(warm);
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(warm, 300);
    return () => window.clearTimeout(id);
  }, [effPackedBy, effStaffId, effPickedBy, shippedFilter, carrierFilter, statusFilter, exceptionsOnly, queryClient]);



  useEventBridge({
  });

  const fetchedRecords = allTimeMode ? allTimeQuery.data ?? [] : weekBuckets.rows;

  // Clip the merged rows to the ACTIVE window — the selected week OR explicit calendar range (both surface as effectiveWeekStart/End).
  // A time window clips on the SAME exact instants the server applied (never day keys), so rows cannot disagree.
  const rawRecords = useMemo(() => {
    if (!effectiveWeekStart || !effectiveWeekEnd) return fetchedRecords;
    if (shippedInstantWindow) {
      return fetchedRecords.filter((r) => {
        const src = r as { created_at?: string; effShipTime?: string };
        return shippedStampInWindow(String(src.created_at || src.effShipTime || ''), shippedInstantWindow);
      });
    }
    return fetchedRecords.filter((r) => {
      const src = r as { created_at?: string; effShipTime?: string };
      const key = toPSTDateKey(String(src.created_at || src.effShipTime || ''));
      return key !== '' && key >= effectiveWeekStart && key <= effectiveWeekEnd;
    });
  }, [fetchedRecords, effectiveWeekStart, effectiveWeekEnd, shippedInstantWindow]);
  const dedupedRecords = useMemo(() => dedupeShippedRecords(rawRecords), [rawRecords]);

  // Type / carrier / status / exceptions are answered by the fetch (one SQL
  // predicate with the sidebar facet counts); `?ostatus` — a state derived from
  // the whole record — is the one view filter still applied here.
  const records = useMemo(
    () => dedupedRecords.filter((r) => isShippedDeskRow(r) && matchesOutbound(r)),
    [dedupedRecords, matchesOutbound],
  );

  // Attach the derived outbound state (packed-time vs left-warehouse-time) once,
  // so the grouped list and the scan-out sections read the same source of truth.
  const derivedRecords = useMemo<DerivedPackerRecord[]>(
    () => records.map(deriveShippedRecord),
    [records],
  );

  // Spine-first hydration:
  const salIds = useMemo(
    () =>
      SPINE_FIRST
        ? derivedRecords
            .map((r) => Number((r as { id?: unknown }).id))
            .filter((id) => Number.isFinite(id))
        : [],
    [derivedRecords],
  );
  const salIdsKey = useMemo(() => salIds.slice().sort((a, b) => a - b).join(','), [salIds]);
  const hydrationQuery = useQuery({
    queryKey: ['shipped-hydration', salIdsKey],
    queryFn: () => fetchShippedHydration(salIds),
    enabled: SPINE_FIRST && salIds.length > 0,
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
  });
  const hydratedRecords = useMemo<DerivedPackerRecord[]>(() => {
    const map = hydrationQuery.data;
    if (!SPINE_FIRST || !map) return derivedRecords;
    return derivedRecords.map((r) => {
      const h = map[Number((r as { id?: unknown }).id)];
      return h ? ({ ...r, ...h } as DerivedPackerRecord) : r;
    });
  }, [derivedRecords, hydrationQuery.data]);

  const searchMeta = null;
  const isResolvingSearch = false;

  /* Truncation surfacing: */
  const isTruncated = normalizedSearch
    ? false
    : allTimeMode
      ? (allTimeQuery.data?.length ?? 0) >= fetchLimit
      : weekBuckets.truncated;
  const pagination = {
    isTruncated,
    loadMore,
    isLoadingMore: query.isFetching && pageMultiplier > 1,
  };

  return { query, derivedRecords: hydratedRecords, searchMeta, isResolvingSearch, pagination };
}
