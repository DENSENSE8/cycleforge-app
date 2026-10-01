'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useEventBridge } from '@/hooks';
import { dashboardShippedQuery } from '@/lib/queries/dashboard-queries';
import { fetchShippedHydration } from '@/lib/dashboard-table-data';
import { useShippedWeekBuckets } from './useShippedWeekBuckets';
import { SHIPPED_FEED_PAGE_SIZE, SHIPPED_FEED_PHASE } from '@/lib/shipping/shipped-feed-config';
import { toPSTDateKey } from '@/utils/date';
import { shippedStampInWindow } from '@/lib/shipping/shipped-filter/shipped-filter-params';
import {
  dedupeShippedRecords,
  deriveShippedRecord,
  isShippedDeskRow,
  shippedRecordTimestamp,
  type DerivedPackerRecord,
} from '@/lib/shipped-records';
import type { ShippedTableFilters } from './useShippedTableFilters';


/** Fetch the server-seeded first package page, then the selected period/filter pages. */
export function useShippedTableRecords(filters: ShippedTableFilters) {
  const {
    effectiveWeekStart,
    effectiveWeekEnd,
    effPackedBy,
    effStaffId,
    effPickedBy,
    shippedTime,
    dateFrom,
    dateTo,
    hasDateRange,
    shippedFilter,
    shippedInstantWindow,
    exceptionsOnly,
    carrierFilter,
    channelFilter,
    statusFilter,
    matchesOutbound,
    normalizedSearch,
    sort,
  } = filters;


  // Bucketed week cache:
  const allTimeMode = !effectiveWeekStart || !effectiveWeekEnd;

  const [pageMultiplier, setPageMultiplier] = useState(1);
  const fetchLimit = pageMultiplier * SHIPPED_FEED_PAGE_SIZE;
  // A named day loads until the server returns a short page, cap 20 (2,000).
  // A week loads 3 pages, then Load more. A fresh `{dateFrom,dateTo}` every
  // render used to change the query key, drop settled data, and stop on page 1.
  const namedDay = hasDateRange && dateFrom === dateTo;
  const autoCap = namedDay ? 20 : 3;
  const dayWindow = useMemo(
    () => (hasDateRange ? { dateFrom, dateTo } : null),
    [hasDateRange, dateFrom, dateTo],
  );
  useEffect(() => {
    setPageMultiplier(1);
  }, [
    effectiveWeekStart,
    effectiveWeekEnd,
    effPackedBy,
    effStaffId,
    shippedFilter,
    carrierFilter,
    channelFilter,
    statusFilter,
    exceptionsOnly,
    shippedTime,
    dayWindow,
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
    channel: channelFilter,
    statusCategory: statusFilter,
    exceptionsOnly,
    shippedTime: shippedTime ?? dayWindow,
    sort,
    pickedBy: effPickedBy,
    searchTerm: normalizedSearch,
    enabled: !allTimeMode,
    limit: fetchLimit,
    phase: SHIPPED_FEED_PHASE,
  });

  const allTimeQuery = useQuery({
    ...dashboardShippedQuery({
      packedBy: effPackedBy,
      staffId: effStaffId ?? undefined,
      shippedFilter,
      carrier: carrierFilter,
      channel: channelFilter,
      statusCategory: statusFilter,
      exceptionsOnly,
      shippedTime,
      pickedBy: effPickedBy,
      searchTerm: normalizedSearch,
      limit: fetchLimit,
      phase: SHIPPED_FEED_PHASE,
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




  useEventBridge({
  });

  const fetchedRecords = allTimeMode ? allTimeQuery.data ?? [] : weekBuckets.rows;

  // Clip on the dock handoff timestamp. `created_at` is the represented PACK
  // row and can be days or months older than the SHIP_CONFIRM that moved the
  // package onto this desk.
  const rawRecords = useMemo(() => {
    if (!effectiveWeekStart || !effectiveWeekEnd) return fetchedRecords;
    if (shippedInstantWindow) {
      return fetchedRecords.filter((r) => {
        return shippedStampInWindow(shippedRecordTimestamp(r), shippedInstantWindow);
      });
    }
    return fetchedRecords.filter((r) => {
      const key = toPSTDateKey(shippedRecordTimestamp(r));
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
      derivedRecords
        .map((record) => Number(record.id))
        .filter((id) => Number.isFinite(id)),
    [derivedRecords],
  );
  const salIdsKey = useMemo(() => salIds.slice().sort((a, b) => a - b).join(','), [salIds]);
  const hydrationQuery = useQuery({
    queryKey: ['shipped-hydration', salIdsKey],
    queryFn: () => fetchShippedHydration(salIds),
    enabled: salIds.length > 0,
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
  });
  const hydratedRecords = useMemo<DerivedPackerRecord[]>(() => {
    const map = hydrationQuery.data;
    if (!map) return derivedRecords;
    return derivedRecords.map((r) => {
      const h = map[Number(r.id)];
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
  useEffect(() => {
    if (normalizedSearch || query.isFetching || !isTruncated || pageMultiplier >= autoCap) return;
    setPageMultiplier((m) => (m >= autoCap ? m : m + 1));
  }, [normalizedSearch, query.isFetching, isTruncated, pageMultiplier, autoCap]);
  const pagination = {
    isTruncated,
    loadMore,
    isLoadingMore: query.isFetching && pageMultiplier > 1,
  };

  return { query, derivedRecords: hydratedRecords, searchMeta, isResolvingSearch, pagination };
}
