'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEventBridge } from '@/hooks';
import { dashboardShippedQuery, dashboardShippedWeekQuery, SHIPPED_WEEK_PAGE_SIZE } from '@/lib/queries/dashboard-queries';
import { fetchShippedHydration } from '@/lib/dashboard-table-data';
import { useShippedWeekBuckets } from './useShippedWeekBuckets';
import { getRecentWeekBuckets } from '@/lib/dashboard-week-range';
import { toPSTDateKey } from '@/utils/date';
import { isStalled } from '@/lib/shipping/shipment-status';
import {
  dedupeShippedRecords,
  deriveShippedRecord,
  isFbaPackerRecord,
  isSkuPackerRecord,
  hasLinkedOrder,
  isExceptionPackerRecord,
  isShippedDeskRow,
  type DerivedPackerRecord,
} from '@/lib/shipped-records';
import type { ShippedTableFilters } from './useShippedTableFilters';
import { useRefreshSignal } from '@/lib/refresh/bus';

// Spine-first render (immediate paint):
const SPINE_FIRST = process.env.NEXT_PUBLIC_SHIPPED_SPINE_FIRST === 'true';
const SHIPPED_PHASE: 'spine' | 'full' = SPINE_FIRST ? 'spine' : 'full';

/** Fetches the shipped records (week buckets or all-time), runs the type + carrier/status/exception/outbound filter pipeline, and attaches… */
export function useShippedTableRecords(filters: ShippedTableFilters) {
  const {
    effectiveWeekStart,
    effectiveWeekEnd,
    effPackedBy,
    effTestedBy,
    effStaffId,
    shippedFilter,
    exceptionsOnly,
    carrierFilter,
    statusFilter,
    obStatus,
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
    effTestedBy,
    effStaffId,
    shippedFilter,
    normalizedSearch,
  ]);
  const loadMore = useCallback(() => setPageMultiplier((m) => m + 1), []);

  const weekBuckets = useShippedWeekBuckets({
    rangeStart: effectiveWeekStart,
    rangeEnd: effectiveWeekEnd,
    packedBy: effPackedBy,
    testedBy: effTestedBy,
    staffId: effStaffId ?? undefined,
    shippedFilter,
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
      testedBy: effTestedBy,
      staffId: effStaffId ?? undefined,
      shippedFilter,
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
            testedBy: effTestedBy,
            staffId: effStaffId ?? undefined,
            shippedFilter,
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
  }, [effPackedBy, effTestedBy, effStaffId, shippedFilter, queryClient]);


  // Refresh events from form submits / cross-pane mutations → invalidate.
  useRefreshSignal('orders.outbound', () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard-table', 'shipped'] });
    queryClient.invalidateQueries({ queryKey: ['shipped-table'] });
  });

  useEventBridge({
  });

  const fetchedRecords = allTimeMode ? allTimeQuery.data ?? [] : weekBuckets.rows;

  // Clip the merged rows to the ACTIVE window — the selected week OR explicit calendar range (both surface as effectiveWeekStart/End).
  const rawRecords = useMemo(() => {
    if (!effectiveWeekStart || !effectiveWeekEnd) return fetchedRecords;
    return fetchedRecords.filter((r) => {
      const src = r as { created_at?: string; effShipTime?: string };
      const key = toPSTDateKey(String(src.created_at || src.effShipTime || ''));
      return key !== '' && key >= effectiveWeekStart && key <= effectiveWeekEnd;
    });
  }, [fetchedRecords, effectiveWeekStart, effectiveWeekEnd]);
  const dedupedRecords = useMemo(() => dedupeShippedRecords(rawRecords), [rawRecords]);

  const typeFilteredRecords = useMemo(() =>
    shippedFilter === 'fba'
      ? dedupedRecords.filter(isFbaPackerRecord)
      : shippedFilter === 'orders'
        ? dedupedRecords.filter((r) => !isFbaPackerRecord(r) && (hasLinkedOrder(r) || isExceptionPackerRecord(r)))
        : shippedFilter === 'sku'
          ? dedupedRecords.filter(isSkuPackerRecord)
          : dedupedRecords.filter((r) => {
              if (isSkuPackerRecord(r)) return false;
              if (isFbaPackerRecord(r)) return true;
              return hasLinkedOrder(r) || isExceptionPackerRecord(r);
            }),
    [dedupedRecords, shippedFilter],
  );

  const carrierFilteredRecords = useMemo(() => {
    if (!exceptionsOnly && !carrierFilter && !statusFilter && !obStatus) return typeFilteredRecords;
    return typeFilteredRecords.filter((r) => {
      if (!matchesOutbound(r)) return false;
      if (carrierFilter && String(r.carrier ?? '').toUpperCase() !== carrierFilter) return false;
      if (statusFilter && String(r.latest_status_category ?? '').toUpperCase() !== statusFilter) return false;
      if (exceptionsOnly) {
        const hasEx = Boolean(r.has_exception);
        const stalled = isStalled({
          isTerminal: r.is_terminal ?? null,
          category: r.latest_status_category ?? null,
          latestEventAt: r.latest_event_at ?? null,
        });
        if (!hasEx && !stalled) return false;
      }
      return true;
    });
  }, [typeFilteredRecords, exceptionsOnly, carrierFilter, statusFilter, obStatus, matchesOutbound]);


  const records = useMemo(
    () => carrierFilteredRecords.filter(isShippedDeskRow),
    [carrierFilteredRecords],
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
