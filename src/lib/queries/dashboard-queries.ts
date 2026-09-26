'use client';

/**
 * Single source of truth for the dashboard's main table queries.
 *
 * Every consumer — the table components AND any prefetcher (the page-level
 * warm-up effect, the sign-in BootGate) — builds its query from these
 * factories. Because React Query dedupes by `queryKey`, a prefetch and the
 * `useQuery` that later mounts MUST share an identical key + queryFn or the
 * cache silently misses and the table refetches (the "spinner after the
 * splash" bug). Keeping the key here, in one place, makes that impossible to
 * drift.
 *
 * UI-only options that don't belong to a fetch definition stay at the call
 * site, NOT in these factories:
 *   - `placeholderData` (keep-previous-data while typing a search)
 *   - `enabled`         (shipped view disables the week query while searching)
 *   - `refetchInterval` (FBA board polls every 60s)
 * Those are also not accepted by `prefetchQuery`, so leaving them out keeps the
 * factory output safe to pass to both `useQuery` and `prefetchQuery`.
 */

import { queryOptions } from '@tanstack/react-query';
import {
  fetchPendingOrdersData,
  fetchUnshippedOrdersData,
  fetchUnshippedQueueCounts,
  fetchDashboardPackedRecords,
} from '@/lib/dashboard-table-data';
import { fetchStagedOrdersData } from '@/lib/outbound/outbound-table-data';
import { fetchWarrantyClaims, fetchWarrantyCoverage, type FetchWarrantyClaimsParams } from '@/lib/warranty/client';
import { isPastWeekStart } from '@/lib/dashboard-week-range';

export interface OrderQueryParams {
  searchQuery?: string;
  packedBy?: number;
  testedBy?: number;
  /** Universal staff filter (P1-WORK-02): one staff's assigned work, or all. */
  staffId?: number;
  strictSearchScope?: boolean;
  /** Coarse stage facet (?stage), filtered SERVER-side; absent = all
   *  in-warehouse stages. Fulfillment STATE / lane (?ustatus) stays a client filter. */
  stage?: 'pending' | 'tested' | 'packed';
  /** Shortage desk: only operator-blocked rows. */
  blockedOnly?: boolean;
  /** Row ceiling for the fulfillment page (Phase 2). Grows on "Load more"; the
   *  server truncates + the counts endpoint's total drives whether more exist. */
  limit?: number;
}

/**
 * Per-week (and all-time) fetch ceiling. The week query returns at most this
 * many rows, newest-first; the day-banded list virtualizes them. When a week
 * actually hits this ceiling it is TRUNCATED (more rows exist), which the table
 * surfaces as an explicit "Load more" (never a silent cap) by re-requesting the
 * same week at a higher multiple of this size. Past weeks cache per (week,limit)
 * pair, so a bumped week fetches once then serves from cache forever.
 */
export const SHIPPED_WEEK_PAGE_SIZE = 1000;

export interface ShippedQueryParams {
  weekStart?: string;
  weekEnd?: string;
  packedBy?: number;
  testedBy?: number;
  /** Universal staff filter (P1-WORK-02): packed_by OR tested_by this staff. */
  staffId?: number;
  shippedFilter?: string;
  /**
   * Desk find text, answered SERVER-side by `/api/packerlogs?q=`.
   *
   * Part of the cache key on purpose: a searched window is a DIFFERENT row set
   * from the same window unsearched, and sharing one entry would let a narrowed
   * answer overwrite the desk's full week (or the reverse) under the same key.
   * Empty string ⇒ byte-identical key to the pre-search behaviour, so warmed
   * and unsearched weeks still hit the entries they always did.
   */
  searchTerm?: string;
  /** Row ceiling for this fetch; default {@link SHIPPED_WEEK_PAGE_SIZE}. */
  limit?: number;
  /** Spine-first: 'spine' fetches immediate-paint columns only (deferred fields
   *  hydrate separately); 'full' (default) is the complete row. Part of the
   *  cache key so spine and full never share an entry. */
  phase?: 'spine' | 'full';
}

/** Pending queue (label-assigned, not yet packed). Matches the Pending grid / UnshippedTable. */
export function pendingOrdersQuery({
  searchQuery = '',
  packedBy,
  testedBy,
  strictSearchScope = false,
}: OrderQueryParams = {}) {
  return queryOptions({
    queryKey: ['dashboard-table', 'pending', { searchQuery, packedBy, testedBy, strictSearchScope }],
    queryFn: () => fetchPendingOrdersData({ searchQuery, packedBy, testedBy, strictSearchScope }),
    staleTime: 60_000,
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * The merged **Unshipped** queue — the whole pre-ship backlog (Awaiting ∪ Pending).
 * Single source behind `UnshippedTable`; the per-stage split is a UI filter.
 * staleTime 60s (the more-live of the old pending/awaiting values) since this is
 * the active fulfilment work queue.
 */
export function unshippedOrdersQuery({
  searchQuery = '',
  packedBy,
  testedBy,
  staffId,
  strictSearchScope = false,
  stage,
  blockedOnly = false,
  limit,
}: OrderQueryParams = {}) {
  return queryOptions({
    queryKey: [
      'dashboard-table',
      'unshipped',
      {
        searchQuery,
        packedBy,
        testedBy,
        staffId,
        strictSearchScope,
        stage: stage ?? null,
        blockedOnly,
        limit: limit ?? null,
      },
    ],
    queryFn: () =>
      fetchUnshippedOrdersData({
        searchQuery,
        packedBy,
        testedBy,
        staffId,
        strictSearchScope,
        stage,
        blockedOnly,
        limit,
      }),
    staleTime: 60_000,
    gcTime: 15 * 60 * 1000,
  });
}

/**
 * Lightweight Unshipped-queue counts (total + per-stage + lane combos) WITHOUT
 * the row payload (Phase 2). The sidebar legend / stage dropdown / nav badge use
 * this instead of counting off the full fulfillment rows. Its own key namespace
 * so it never collides with the row list. `staffId` scopes it to `?staff=`.
 */
export function unshippedQueueCountsQuery({ staffId }: { staffId?: number } = {}) {
  return queryOptions({
    queryKey: ['dashboard-table', 'unshipped-counts', { staffId: staffId ?? null }],
    queryFn: () => fetchUnshippedQueueCounts({ staffId }),
    staleTime: 60_000,
    gcTime: 15 * 60 * 1000,
  });
}

/**
 * Dashboard · Packed — first-class `stagedOnly` orders path (PACK event, no
 * SHIP_CONFIRM). Not a client filter of the shipped week packerlogs query.
 */
export function packedOrdersQuery({
  searchQuery = '',
  staffId,
  dateFrom,
  dateTo,
}: {
  searchQuery?: string;
  staffId?: number;
  dateFrom?: string;
  dateTo?: string;
} = {}) {
  return queryOptions({
    queryKey: [
      'dashboard-table',
      'packed',
      {
        searchQuery,
        staffId: staffId ?? null,
        dateFrom: dateFrom ?? null,
        dateTo: dateTo ?? null,
      },
    ],
    queryFn: () => fetchStagedOrdersData({ searchQuery, staffId, dateFrom, dateTo }),
    staleTime: 60_000,
    gcTime: 15 * 60 * 1000,
  });
}

/** Shipped/packed records for a week window. Matches the Shipped ledger's feed (`useShippedTableRecords`). */
export function dashboardShippedQuery({
  weekStart,
  weekEnd,
  packedBy,
  testedBy,
  staffId,
  shippedFilter,
  searchTerm = '',
  limit = SHIPPED_WEEK_PAGE_SIZE,
  phase = 'full',
}: ShippedQueryParams = {}) {
  return queryOptions({
    queryKey: ['dashboard-table', 'shipped', { weekStart, weekEnd, packedBy, testedBy, staffId, shippedFilter, searchTerm, limit, phase }],
    queryFn: () =>
      fetchDashboardPackedRecords({ packedBy, testedBy, staffId, weekStart, weekEnd, shippedFilter, searchTerm, limit, phase }),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

interface ShippedWeekQueryParams {
  /** Canonical Monday (YYYY-MM-DD) — the stable per-week cache unit. */
  weekStart: string;
  /** Canonical Sunday (YYYY-MM-DD). */
  weekEnd: string;
  packedBy?: number;
  testedBy?: number;
  staffId?: number;
  shippedFilter?: string;
  /** Desk find text (see {@link ShippedQueryParams.searchTerm}). Part of the key. */
  searchTerm?: string;
  /** Row ceiling for this week; default {@link SHIPPED_WEEK_PAGE_SIZE}. Part of
   *  the cache key, so a bumped ceiling is its own immutable past-week entry. */
  limit?: number;
  /** Spine-first phase (see {@link ShippedQueryParams.phase}). Part of the key. */
  phase?: 'spine' | 'full';
}

/**
 * One canonical Mon–Sun week of shipped records — the SoT for both the bucketed
 * `useQueries` in `useShippedWeekBuckets` AND the warm-up prefetch, so their keys
 * never drift. Past weeks are immutable (`staleTime: Infinity`) so they're
 * fetched once then served from cache forever; the current week stays live and
 * is refreshed by the dashboard refresh/Ably invalidations.
 *
 * A SEARCHED week is never treated as immutable even when it is in the past.
 * `searchTerm` is in the key, so every keystroke mints its own entry; parking
 * each one for a day would leave a typed-through word's worth of dead week
 * payloads resident for the session. Search entries keep the live TTLs and get
 * collected once the operator moves on.
 */
export function dashboardShippedWeekQuery({
  weekStart,
  weekEnd,
  packedBy,
  testedBy,
  staffId,
  shippedFilter,
  searchTerm = '',
  limit = SHIPPED_WEEK_PAGE_SIZE,
  phase = 'full',
}: ShippedWeekQueryParams) {
  const immutable = isPastWeekStart(weekStart) && !searchTerm;
  return queryOptions({
    queryKey: ['dashboard-table', 'shipped', 'week', weekStart, { packedBy, testedBy, staffId, shippedFilter, searchTerm, limit, phase }],
    queryFn: () =>
      fetchDashboardPackedRecords({ weekStart, weekEnd, packedBy, testedBy, staffId, shippedFilter, searchTerm, limit, phase }),
    staleTime: immutable ? Infinity : 5 * 60 * 1000,
    gcTime: immutable ? 24 * 60 * 60 * 1000 : 15 * 60 * 1000,
  });
}

/**
 * Warranty Logger claim list. Shared by the warranty sidebar AND the right-pane
 * table so both hit one cache key (same factory rule as the order tables above).
 */
export function warrantyClaimsQuery(params: FetchWarrantyClaimsParams = {}) {
  const status = params.status ?? null;
  const search = params.search?.trim() || '';
  const expiringWithinDays = params.expiringWithinDays ?? null;
  const provisionalOnly = Boolean(params.provisionalOnly);
  return queryOptions({
    queryKey: ['warranty-claims', { status, search, expiringWithinDays, provisionalOnly }],
    queryFn: () => fetchWarrantyClaims({ status, search, expiringWithinDays, provisionalOnly }),
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Read-only warranty-coverage lookup ("is this order still under warranty?").
 * Keyed on the trimmed query so the same order #/serial/SKU shares one cache entry.
 */
export function warrantyCoverageQuery(q: string) {
  const query = q.trim();
  return queryOptions({
    queryKey: ['warranty-coverage', query],
    queryFn: () => fetchWarrantyCoverage(query),
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
  });
}
