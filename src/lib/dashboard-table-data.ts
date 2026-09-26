'use client';

import type { ShippedOrder } from '@/lib/neon/orders-queries';
import type { PackerRecord } from '@/hooks/usePackerLogs';
import type { ShippedSearchField } from '@/lib/shipped-search';
import {
  ZERO_QUEUE_COUNTS,
  normalizeQueueCountsPayload,
  type QueueCountsCombo,
  type UnshippedQueueCounts,
} from '@/lib/orders/queue-counts-normalize';
import {
  dedupeByOrderId,
  isNonFbaRecord,
  normalizeUnshippedOrdersPayload,
  toOrderRecord,
} from '@/lib/orders/order-record-normalize';
import { DESK_PAIR_PARAM, DESK_QUEUE_PARAM } from '@/lib/outbound/desk-views';
import {
  normalizeDeskCounts,
  type DeskCounts,
  type DeskPairFilter,
  type DeskQueueFilter,
} from '@/lib/orders/desk-view-filters';

const FRESH_FETCH_OPTIONS: RequestInit = { cache: 'no-store' };

export async function fetchPendingOrdersData({
  searchQuery = '',
  packedBy,
  testedBy,
  strictSearchScope = false,
}: {
  searchQuery?: string;
  packedBy?: number;
  testedBy?: number;
  strictSearchScope?: boolean;
}) {
  const params = new URLSearchParams();
  if (searchQuery.trim()) {
    params.set('q', searchQuery.trim());
  }
  // Pending view: only show orders with a shipment link that are not shipped and do not
  // have a matching packer_logs row by shipment_id.
  params.set('excludePacked', 'true');
  if (packedBy !== undefined) params.set('packedBy', String(packedBy));
  if (testedBy !== undefined) params.set('testedBy', String(testedBy));

  const url = params.toString() ? `/api/orders?${params.toString()}` : '/api/orders';
  const res = await fetch(url, FRESH_FETCH_OPTIONS);
  if (!res.ok) {
    throw new Error('Failed to fetch pending orders');
  }

  const data = await res.json();
  const records = dedupeByOrderId(
    ((data.orders || []).map(toOrderRecord) as ShippedOrder[]).filter(isNonFbaRecord)
  );
  // When searching, return all matches regardless of shipment_id so an order with no label is still discoverable from the pending view…
  if (searchQuery.trim() && !strictSearchScope) return records;
  return records.filter((record) => record.shipment_id != null);
}

/** One pending-queue row by DB order id (bypasses list cache on the server). */
export async function fetchPendingOrderRowById(
  orderId: number,
  options: { searchQuery?: string; packedBy?: number; testedBy?: number } = {}
): Promise<ShippedOrder | null> {
  if (!Number.isFinite(orderId) || orderId <= 0) return null;
  const params = new URLSearchParams();
  params.set('orderId', String(orderId));
  params.set('excludePacked', 'true');
  const q = String(options.searchQuery || '').trim();
  if (q) params.set('q', q);
  if (options.packedBy !== undefined) params.set('packedBy', String(options.packedBy));
  if (options.testedBy !== undefined) params.set('testedBy', String(options.testedBy));

  const res = await fetch(`/api/orders?${params.toString()}`, FRESH_FETCH_OPTIONS);
  if (!res.ok) return null;
  const data = await res.json();
  const records = dedupeByOrderId(
    ((data.orders || []).map(toOrderRecord) as ShippedOrder[]).filter(isNonFbaRecord)
  );
  const visible = q ? records : records.filter((record) => record.shipment_id != null);
  return visible[0] ?? null;
}

export async function fetchDashboardOrderRowById(orderId: number): Promise<ShippedOrder | null> {
  if (!Number.isFinite(orderId) || orderId <= 0) return null;

  const params = new URLSearchParams();
  params.set('orderId', String(orderId));
  params.set('includeShipped', 'true');

  const res = await fetch(`/api/orders?${params.toString()}`, FRESH_FETCH_OPTIONS);
  if (!res.ok) return null;

  const data = await res.json();
  const records = dedupeByOrderId(
    ((data.orders || []).map(toOrderRecord) as ShippedOrder[]).filter(isNonFbaRecord)
  );
  const orderRecord = records[0] ?? null;
  if (!orderRecord) return null;

  const shippedSearchKey = String(orderRecord.order_id || orderId).trim();
  if (!shippedSearchKey) return orderRecord;

  try {
    const shippedResults = await fetchDashboardShippedData({ searchQuery: shippedSearchKey });
    const exact = shippedResults.find((record) => Number(record.id) === orderId);
    return exact ?? orderRecord;
  } catch {
    return orderRecord;
  }
}

/** In-warehouse To-ship queue = labeled + tracked, still in the building. */
export async function fetchUnshippedOrdersData({
  searchQuery = '',
  packedBy,
  testedBy,
  staffId,
  strictSearchScope = false,
  stage,
  blockedOnly = false,
  pair,
  queue,
  limit,
}: {
  searchQuery?: string;
  packedBy?: number;
  testedBy?: number;
  staffId?: number;
  strictSearchScope?: boolean;
  stage?: 'pending' | 'tested' | 'packed';
  blockedOnly?: boolean;
  /** Shortage desk lens (`?pair=po`) — forwarded as `pair`; the server implies blockedOnly. */
  pair?: DeskPairFilter;
  /** To-ship lens (`?queue=pick`) — forwarded as `queue`; the server implies inWarehouse. */
  queue?: DeskQueueFilter;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (searchQuery.trim()) params.set('q', searchQuery.trim());
  if (packedBy !== undefined) params.set('packedBy', String(packedBy));
  if (testedBy !== undefined) params.set('testedBy', String(testedBy));
  if (staffId !== undefined) params.set('staff', String(staffId));
  const scoped = !searchQuery.trim() || strictSearchScope;
  if (scoped) params.set('inWarehouse', 'true');
  if (blockedOnly) params.set('blockedOnly', 'true');
  if (pair) params.set(DESK_PAIR_PARAM, pair);
  if (queue) params.set(DESK_QUEUE_PARAM, queue);
  // Phase 1: on the scoped, non-search fulfillment load, request the thin queue
  // projection and push the coarse stage facet to SQL. A search stays full-shape
  // (the route ignores listShape when `q` is present) for match highlighting.
  if (scoped && !searchQuery.trim()) {
    params.set('listShape', 'queue');
    if (stage) params.set('stage', stage);
    // Phase 2: bounded page. "Load more" grows this; search stays unbounded.
    if (limit != null && limit > 0) params.set('limit', String(limit));
  }

  const res = await fetch(`/api/orders?${params.toString()}`, FRESH_FETCH_OPTIONS);
  if (!res.ok) {
    throw new Error('Failed to fetch unshipped orders');
  }

  const data = await res.json();
  return normalizeUnshippedOrdersPayload(data.orders || []);
}
/** One in-warehouse queue row by DB id for URL deep links. */
export async function fetchUnshippedOrderRowById({
  orderId,
  staffId,
}: {
  orderId: number;
  staffId?: number;
}): Promise<ShippedOrder | null> {
  if (!Number.isFinite(orderId) || orderId <= 0) return null;

  const params = new URLSearchParams({
    orderId: String(orderId),
    inWarehouse: 'true',
  });
  if (staffId !== undefined) params.set('staff', String(staffId));
  const res = await fetch(`/api/orders?${params.toString()}`, FRESH_FETCH_OPTIONS);
  if (!res.ok) return null;

  const data = await res.json();
  const records = normalizeUnshippedOrdersPayload(data.orders || []);
  return records.find((record) => Number(record.id) === orderId) ?? null;
}

/**
 * Order lookup (the support call): every order line matching `searchQuery` —
 * order #, customer, email, tracking, SKU — in ANY state, shipped included.
 * `/api/orders?q=` runs the match server-side and unbounded.
 */
export async function fetchOrderLookupData(searchQuery: string): Promise<ShippedOrder[]> {
  const q = searchQuery.trim();
  if (!q) return [];
  const params = new URLSearchParams({ q, includeShipped: 'true' });
  const res = await fetch(`/api/orders?${params.toString()}`, FRESH_FETCH_OPTIONS);
  if (!res.ok) throw new Error('Failed to search orders');
  const data = await res.json();
  return normalizeUnshippedOrdersPayload(data.orders || []);
}


// Shape + normalization live in the shared waist so the RSC seed and this
// browser fetch cannot produce different cache entries for the same key.
export type { QueueCountsCombo, UnshippedQueueCounts };

/**
 * Lightweight Unshipped-queue tallies — total + per-stage + raw lane combos —
 * WITHOUT downloading the rows (Phase 2). Powers the sidebar legend / stage
 * dropdown / nav badge so they stop paying for the full fulfillment row payload.
 */
export async function fetchUnshippedQueueCounts({
  staffId,
}: { staffId?: number } = {}): Promise<UnshippedQueueCounts> {
  const params = new URLSearchParams();
  if (staffId !== undefined) params.set('staff', String(staffId));
  const qs = params.toString();
  const res = await fetch(`/api/orders/queue-counts${qs ? `?${qs}` : ''}`, FRESH_FETCH_OPTIONS);
  if (!res.ok) return ZERO_QUEUE_COUNTS;
  const data = await res.json().catch(() => null);
  // Zeros are the browser fallback; the seed leaves the key unset instead.
  return normalizeQueueCountsPayload(data) ?? ZERO_QUEUE_COUNTS;
}

/**
 * The outbound desk sidebar's five badges (`GET /api/orders/desk-counts`).
 * Throws on failure — a badge that silently reads 0 is a false all-clear.
 */
export async function fetchDeskCounts(): Promise<DeskCounts> {
  const res = await fetch('/api/orders/desk-counts', FRESH_FETCH_OPTIONS);
  if (!res.ok) throw new Error(`Failed to fetch desk counts (${res.status})`);
  return normalizeDeskCounts(await res.json());
}

export interface DashboardShippedSearchMeta {
  outOfScope: boolean;
  outOfScopeSuggestion: { filter: string; count: number } | null;
  debug: Record<string, unknown> | null;
}

export interface DashboardShippedSearchResult {
  records: ShippedOrder[];
  meta: DashboardShippedSearchMeta;
}

export async function fetchDashboardShippedSearch({
  searchQuery,
  packedBy,
  testedBy,
  staffId,
  shippedFilter,
  searchField,
}: {
  searchQuery: string;
  packedBy?: number;
  testedBy?: number;
  staffId?: number;
  shippedFilter?: string;
  searchField?: ShippedSearchField;
}): Promise<DashboardShippedSearchResult> {
  const params = new URLSearchParams();
  params.set('q', searchQuery.trim());
  if (searchField && searchField !== 'all') params.set('searchField', searchField);
  if (packedBy !== undefined) params.set('packedBy', String(packedBy));
  if (testedBy !== undefined) params.set('testedBy', String(testedBy));
  if (staffId !== undefined) params.set('staff', String(staffId));
  if (shippedFilter) params.set('shippedFilter', shippedFilter);

  const res = await fetch(`/api/shipped?${params.toString()}`, FRESH_FETCH_OPTIONS);
  if (!res.ok) throw new Error('Failed to fetch shipped orders');

  const debugHeader = res.headers.get('x-search-debug');
  let debug: Record<string, unknown> | null = null;
  if (debugHeader) {
    try { debug = JSON.parse(debugHeader); } catch { debug = null; }
  }

  const data = await res.json();
  const shipped = Array.isArray(data.orders)
    ? data.orders
    : Array.isArray(data.shipped)
      ? data.shipped
      : Array.isArray(data.results)
        ? data.results
        : [];
  const records = dedupeByOrderId((shipped || []).map(toOrderRecord) as ShippedOrder[]);
  const scoped = shippedFilter ? records : records.filter(isNonFbaRecord);
  return {
    records: scoped,
    meta: {
      outOfScope: Boolean(data.outOfScope),
      outOfScopeSuggestion: data.outOfScopeSuggestion ?? null,
      debug,
    },
  };
}

export async function fetchDashboardShippedData({
  searchQuery = '',
  packedBy,
  testedBy,
  weekStart,
  weekEnd,
  shippedFilter,
  searchField,
}: {
  searchQuery?: string;
  packedBy?: number;
  testedBy?: number;
  weekStart?: string;
  weekEnd?: string;
  /** When provided the server filters by type; omit for backward-compat (client filters FBA). */
  shippedFilter?: string;
  searchField?: ShippedSearchField;
}) {
  const params = new URLSearchParams();
  if (searchQuery.trim()) {
    params.set('q', searchQuery.trim());
    if (searchField && searchField !== 'all') params.set('searchField', searchField);
  } else {
    if (weekStart) params.set('weekStart', weekStart);
    if (weekEnd) params.set('weekEnd', weekEnd);
  }
  if (packedBy !== undefined) params.set('packedBy', String(packedBy));
  if (testedBy !== undefined) params.set('testedBy', String(testedBy));
  if (shippedFilter) params.set('shippedFilter', shippedFilter);

  const url = `/api/shipped?${params.toString()}`;
  const res = await fetch(url, FRESH_FETCH_OPTIONS);
  if (!res.ok) {
    throw new Error('Failed to fetch shipped orders');
  }

  const data = await res.json();
  const shipped = Array.isArray(data.orders)
    ? data.orders
    : Array.isArray(data.shipped)
      ? data.shipped
      : Array.isArray(data.results)
        ? data.results
        : [];
  const records = dedupeByOrderId((shipped || []).map(toOrderRecord) as ShippedOrder[]);
  // When shippedFilter is provided the server already scopes the results;
  // fall back to client-side FBA exclusion only for backward-compat callers.
  return shippedFilter ? records : records.filter(isNonFbaRecord);
}

export async function fetchDashboardPackedRecords({
  packedBy,
  testedBy,
  staffId,
  weekStart,
  weekEnd,
  shippedFilter,
  searchTerm = '',
  limit = 1000,
  offset = 0,
  phase = 'full',
}: {
  packedBy?: number;
  testedBy?: number;
  staffId?: number;
  weekStart?: string;
  weekEnd?: string;
  shippedFilter?: string;
  /** The desk's find text, answered in SQL by `/api/packerlogs?q=`. */
  searchTerm?: string;
  limit?: number;
  offset?: number;
  /** Spine-first: 'spine' returns immediate-paint columns only (deferred fields
   *  arrive via fetchShippedHydration); 'full' is the complete row (default). */
  phase?: 'spine' | 'full';
}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (offset) params.set('offset', String(offset));
  if (weekStart) params.set('weekStart', weekStart);
  if (weekEnd) params.set('weekEnd', weekEnd);
  if (packedBy !== undefined) params.set('packedBy', String(packedBy));
  if (testedBy !== undefined) params.set('testedBy', String(testedBy));
  if (staffId !== undefined) params.set('staff', String(staffId));
  if (shippedFilter) params.set('shippedFilter', shippedFilter);
  if (searchTerm.trim()) params.set('q', searchTerm.trim());
  if (phase === 'spine') params.set('phase', 'spine');

  const res = await fetch(`/api/packerlogs?${params.toString()}`, FRESH_FETCH_OPTIONS);
  if (!res.ok) {
    throw new Error('Failed to fetch packed records');
  }

  const data = await res.json();
  return (Array.isArray(data) ? data : []) as PackerRecord[];
}

/** Spine-first deferred fields, keyed by station_activity_logs id. */
export interface ShippedHydrationEntry {
  ship_by_date: string | null;
  deadline_at: string | null;
  tester_id: number | null;
  tester_name: string | null;
  packer_photos_url: Array<{ id: number; url: string; uploadedAt: string }>;
}

/** Fetch the deferred (work_assignments deadline/tester + photos) fields for a page of shipped rows so the spine-first table can fill them… */
export async function fetchShippedHydration(salIds: number[]): Promise<Record<number, ShippedHydrationEntry>> {
  if (salIds.length === 0) return {};
  try {
    const res = await fetch('/api/packerlogs/hydrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ salIds }),
    });
    if (!res.ok) return {};
    const data = await res.json();
    return (data && typeof data === 'object' ? data : {}) as Record<number, ShippedHydrationEntry>;
  } catch {
    return {};
  }
}
