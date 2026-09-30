'use client';

/** Single source of truth for the dashboard's main table queries. */

import { queryOptions } from '@tanstack/react-query';
import {
  fetchPendingOrdersData,
  fetchUnshippedOrdersData,
  fetchUnshippedOrderRowById,
  fetchUnshippedQueueCounts,
  fetchDeskCounts,
  fetchDashboardPackedRecords,
} from '@/lib/dashboard-table-data';
import { fetchStagedOrdersData } from '@/lib/outbound/outbound-table-data';
import { fetchWarrantyClaims, fetchWarrantyCoverage, type FetchWarrantyClaimsParams } from '@/lib/warranty/client';
import { isPastWeekStart } from '@/lib/dashboard-week-range';
import type { DeskPairFilter } from '@/lib/orders/desk-view-filters';
import type { ShippedTimeParams } from '@/lib/shipping/shipped-filter/shipped-filter-params';

interface OrderQueryParams {
  searchQuery?: string;
  packedBy?: number;
  /** `?pickerId` — the order's ORDER/PICK assignee. */
  pickerId?: number;
  /** Universal staff filter (P1-WORK-02): one staff's assigned work, or all. */
  staffId?: number;
  strictSearchScope?: boolean;
  /** Coarse stage facet (?stage), filtered SERVER-side; absent = all
   *  in-warehouse stages. Fulfillment STATE / lane (?ustatus) stays a client filter. */
  stage?: 'pending' | 'picked' | 'packed';
  /** Shortage desk: only operator-blocked rows. */
  blockedOnly?: boolean;
  /** Shortage desk lens — `?pair=po` (PO / receiving-line paired shortages). */
  pair?: DeskPairFilter;
  /** Row ceiling for the fulfillment page (Phase 2). Grows on "Load more"; the
   *  server truncates + the counts endpoint's total drives whether more exist. */
  limit?: number;
  /** `?pickedBy` — the staffer who picked the order. */
  pickedBy?: number;
  /** `?orderFrom` / `?orderTo` — order date, warehouse civil day (YYYY-MM-DD), inclusive. */
  orderFrom?: string;
  orderTo?: string;
  /** `?shipByFrom` / `?shipByTo` — ship-by day, inclusive; either bound drops orders without one. */
  shipByFrom?: string;
  shipByTo?: string;
}

/** Per-week (and all-time) fetch ceiling. */
export const SHIPPED_WEEK_PAGE_SIZE = 1000;

/** The Shipped desk's view filters — answered in SQL by `/api/packerlogs`, one predicate with the sidebar facet counts. Part of the key. */
interface ShippedViewFilterParams {
  carrier?: string | null;
  statusCategory?: string | null;
  exceptionsOnly?: boolean;
  /** Exact shipped-instant window (`?timeFrom`/`?timeTo` over `dateFrom`/`dateTo`); null/absent = none. */
  shippedTime?: ShippedTimeParams | null;
  /** `?pickedBy` — the order's picker. */
  pickedBy?: number;
}

interface ShippedQueryParams extends ShippedViewFilterParams {
  weekStart?: string;
  weekEnd?: string;
  packedBy?: number;
  /** Universal staff filter (P1-WORK-02): packed_by OR tested_by this staff. */
  staffId?: number;
  shippedFilter?: string;
  /** Desk find text, answered SERVER-side by `/api/packerlogs?q=`. */
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
  pickerId,
  strictSearchScope = false,
}: OrderQueryParams = {}) {
  return queryOptions({
    queryKey: ['dashboard-table', 'pending', { searchQuery, packedBy, pickerId, strictSearchScope }],
    queryFn: () => fetchPendingOrdersData({ searchQuery, packedBy, pickerId, strictSearchScope }),
    staleTime: 60_000,
    gcTime: 10 * 60 * 1000,
  });
}

/** The merged **Unshipped** queue — the whole pre-ship backlog (Awaiting ∪ Pending). */
export function unshippedOrdersQuery({
  searchQuery = '',
  packedBy,
  pickerId,
  staffId,
  strictSearchScope = false,
  stage,
  blockedOnly = false,
  pair,
  limit,
  pickedBy,
  orderFrom,
  orderTo,
  shipByFrom,
  shipByTo,
}: OrderQueryParams = {}) {
  return queryOptions({
    queryKey: [
      'dashboard-table',
      'unshipped',
      {
        searchQuery,
        packedBy,
        pickerId,
        staffId,
        strictSearchScope,
        stage: stage ?? null,
        blockedOnly,
        // `undefined` when off (dropped from the hashed key), so the key stays
        // byte-identical to the pre-lens key for every other desk.
        pair,
        limit: limit ?? null,
        // Same `undefined`-when-off rule for the sidebar refinements.
        pickedBy,
        orderFrom,
        orderTo,
        shipByFrom,
        shipByTo,
      },
    ],
    queryFn: () =>
      fetchUnshippedOrdersData({
        searchQuery,
        packedBy,
        pickerId,
        staffId,
        strictSearchScope,
        stage,
        blockedOnly,
        pair,
        limit,
        pickedBy,
        orderFrom,
        orderTo,
        shipByFrom,
        shipByTo,
      }),
    staleTime: 60_000,
    gcTime: 15 * 60 * 1000,
  });
}

/** One in-warehouse queue row by DB id — the desk's URL deep link and the phone's tapped pick share it. */
export function unshippedOrderRowQuery({ orderId, staffId }: { orderId: number | null; staffId?: number }) {
  return queryOptions({
    queryKey: ['dashboard-table', 'unshipped-deep-link', { openOrderId: orderId, staffId }],
    queryFn: () => fetchUnshippedOrderRowById({ orderId: orderId ?? 0, staffId }),
    staleTime: 60_000,
    gcTime: 15 * 60 * 1000,
  });
}

/** Lightweight Unshipped-queue counts (total + per-stage + lane combos) WITHOUT the row payload (Phase 2). */
export function unshippedQueueCountsQuery({ staffId }: { staffId?: number } = {}) {
  return queryOptions({
    queryKey: ['dashboard-table', 'unshipped-counts', { staffId: staffId ?? null }],
    queryFn: () => fetchUnshippedQueueCounts({ staffId }),
    staleTime: 60_000,
    gcTime: 15 * 60 * 1000,
  });
}

/**
 * The outbound desk sidebar's five badges — `{ exceptions, po, pick, triage,
 * shippedToday }` in one request. Under `dashboard-table` so every existing
 * prefix invalidation (Ably reconnect, order mutations) refreshes it too.
 */
export function deskCountsQuery() {
  return queryOptions({
    queryKey: ['dashboard-table', 'desk-counts'],
    queryFn: fetchDeskCounts,
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
  staffId,
  shippedFilter,
  carrier = null,
  statusCategory = null,
  exceptionsOnly = false,
  shippedTime = null,
  pickedBy,
  searchTerm = '',
  limit = SHIPPED_WEEK_PAGE_SIZE,
  phase = 'full',
}: ShippedQueryParams = {}) {
  return queryOptions({
    queryKey: [
      'dashboard-table',
      'shipped',
      // New lenses ride as `undefined` when off (dropped from the hashed key).
      { weekStart, weekEnd, packedBy, staffId, shippedFilter, carrier, statusCategory, exceptionsOnly, searchTerm, limit, phase, shippedTime: shippedTime ?? undefined, pickedBy },
    ],
    queryFn: () =>
      fetchDashboardPackedRecords({
        packedBy, staffId, weekStart, weekEnd, shippedFilter, carrier, statusCategory, exceptionsOnly, searchTerm, limit, phase, shippedTime, pickedBy,
      }),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

interface ShippedWeekQueryParams extends ShippedViewFilterParams {
  /** Canonical Monday (YYYY-MM-DD) — the stable per-week cache unit. */
  weekStart: string;
  /** Canonical Sunday (YYYY-MM-DD). */
  weekEnd: string;
  packedBy?: number;
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

/** One canonical Mon–Sun week of shipped records — the SoT for both the bucketed `useQueries` in `useShippedWeekBuckets` AND the warm-up… */
export function dashboardShippedWeekQuery({
  weekStart,
  weekEnd,
  packedBy,
  staffId,
  shippedFilter,
  carrier = null,
  statusCategory = null,
  exceptionsOnly = false,
  shippedTime = null,
  pickedBy,
  searchTerm = '',
  limit = SHIPPED_WEEK_PAGE_SIZE,
  phase = 'full',
}: ShippedWeekQueryParams) {
  // Tracking status and stalls move after the week closes; only a status-free
  // past week is a fixed answer.
  const immutable = isPastWeekStart(weekStart) && !searchTerm && !statusCategory && !exceptionsOnly;
  return queryOptions({
    queryKey: [
      'dashboard-table',
      'shipped',
      'week',
      weekStart,
      { packedBy, staffId, shippedFilter, carrier, statusCategory, exceptionsOnly, searchTerm, limit, phase, shippedTime: shippedTime ?? undefined, pickedBy },
    ],
    queryFn: () =>
      fetchDashboardPackedRecords({
        weekStart, weekEnd, packedBy, staffId, shippedFilter, carrier, statusCategory, exceptionsOnly, searchTerm, limit, phase, shippedTime, pickedBy,
      }),
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
