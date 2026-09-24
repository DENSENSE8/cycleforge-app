'use client';

import { useQueries } from '@tanstack/react-query';
import { dashboardShippedWeekQuery, SHIPPED_WEEK_PAGE_SIZE } from '@/lib/queries/dashboard-queries';
import { getWeekBucketsForRange } from '@/lib/dashboard-week-range';
import type { PackerRecord } from '@/hooks/usePackerLogs';
import type { ShippedTypeFilter } from './useShippedTableFilters';

interface UseShippedWeekBucketsParams {
  /** Effective window start (YYYY-MM-DD). */
  rangeStart: string;
  /** Effective window end (YYYY-MM-DD). */
  rangeEnd: string;
  packedBy?: number;
  testedBy?: number;
  staffId?: number;
  shippedFilter: ShippedTypeFilter;
  /** False in all-time mode (empty window ⇒ there is nothing to bucket). */
  enabled: boolean;
  /** Desk find text. Rides the fetch (`/api/packerlogs?q=`), never a pass over
   *  the merged rows — a bucket is a WINDOW, so an in-memory narrowing could
   *  only ever narrow the page, never reach the week's older matches. */
  searchTerm?: string;
  /** Per-week row ceiling; default {@link SHIPPED_WEEK_PAGE_SIZE}. */
  limit?: number;
  /** Spine-first phase; 'spine' fetches immediate-paint columns only. */
  phase?: 'spine' | 'full';
}

interface ShippedWeekBucketsResult {
  rows: PackerRecord[];
  isLoading: boolean;
  isFetching: boolean;
  /**
   * True when any fetched week filled its ceiling (more rows exist → Load more).
   *
   * Always false under a search: `/api/packerlogs?q=` drops its page bound, so
   * the answer is already the whole week's matches. Reading `length >= limit`
   * there would light "Load more" on a COMPLETE set and hand the operator a
   * button that re-asks for a page of rows the search already superseded.
   */
  truncated: boolean;
}

/**
 * Fetches the shipped window as canonical Mon–Sun week buckets and merges them.
 *
 * Each bucket is its own React Query entry keyed by the week (not the user's
 * arbitrary range), so scrubbing a date range reuses already-fetched weeks from
 * cache — only a never-seen week hits the network, and a past week never hits it
 * again. This is what turns date filtering on this table into a cache read
 * instead of a fresh DB query per range. The keys share the
 * `['dashboard-table','shipped', …]` prefix so existing refresh invalidations
 * still bust every bucket.
 */
export function useShippedWeekBuckets({
  rangeStart,
  rangeEnd,
  packedBy,
  testedBy,
  staffId,
  shippedFilter,
  enabled,
  searchTerm = '',
  limit = SHIPPED_WEEK_PAGE_SIZE,
  phase = 'full',
}: UseShippedWeekBucketsParams): ShippedWeekBucketsResult {
  const buckets = enabled ? getWeekBucketsForRange(rangeStart, rangeEnd) : [];

  return useQueries({
    queries: buckets.map(({ weekStart, weekEnd }) => ({
      // Key + fetch + TTLs come from the shared factory (SoT) so the warm-up
      // prefetch and this live query can never drift apart.
      ...dashboardShippedWeekQuery({ weekStart, weekEnd, packedBy, testedBy, staffId, shippedFilter, searchTerm, limit, phase }),
      placeholderData: (prev: PackerRecord[] | undefined) => prev,
      enabled,
    })),
    // `combine` memoizes the merged result so a stable reference flows downstream
    // (no re-derive churn in the filter pipeline when nothing changed).
    combine: (results) => ({
      rows: results.flatMap((r) => r.data ?? []),
      isLoading: results.some((r) => r.isLoading),
      isFetching: results.some((r) => r.isFetching),
      // A week that returned exactly `limit` rows hit the ceiling → more exist.
      // A searched week has no ceiling to hit (the route drops it for `q`).
      truncated: !searchTerm && results.some((r) => (r.data?.length ?? 0) >= limit),
    }),
  });
}
