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

/** One `/api/orders` request of the bounded To-ship queue — under the route's 500 clamp, stable so chunks cache. */
const UNSHIPPED_FETCH_CHUNK = 200;

export async function fetchPendingOrdersData({
  searchQuery = '',
  packedBy,
  pickerId,
  strictSearchScope = false,
}: {
  searchQuery?: string;
  packedBy?: number;
  pickerId?: number;
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
  if (pickerId !== undefined) params.set('pickerId', String(pickerId));

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
  options: { searchQuery?: string; packedBy?: number; pickerId?: number } = {}
): Promise<ShippedOrder | null> {
  if (!Number.isFinite(orderId) || orderId <= 0) return null;
  const params = new URLSearchParams();
  params.set('orderId', String(orderId));
  params.set('excludePacked', 'true');
  const q = String(options.searchQuery || '').trim();
  if (q) params.set('q', q);
  if (options.packedBy !== undefined) params.set('packedBy', String(options.packedBy));
  if (options.pickerId !== undefined) params.set('pickerId', String(options.pickerId));

  const res = await fetch(`/api/orders?${params.toString()}`, FRESH_FETCH_OPTIONS);
  if (!res.ok) return null;
  const data = await res.json();
  const records = dedupeByOrderId(
    ((data.orders || []).map(toOrderRecord) as ShippedOrder[]).filter(isNonFbaRecord)
  );
  const visible = q ? records : records.filter((record) => record.shipment_id != null);
  return visible[0] ?? null;
}

export async function fetchDashboardOrderRowById(
  orderId: number,
  {
    includeFba = false,
    enrichFromShipped = true,
  }: {
    includeFba?: boolean;
    /**
     * Re-read the row through `/api/shipped` for shipped-only fields. Search
     * turns it off: its record repaints from the `/api/orders` lines query
     * anyway, so the extra serial hop only delayed first paint (0.3–3 s).
     */
    enrichFromShipped?: boolean;
  } = {},
): Promise<ShippedOrder | null> {
  if (!Number.isFinite(orderId) || orderId <= 0) return null;

  const params = new URLSearchParams();
  params.set('orderId', String(orderId));
  params.set('includeShipped', 'true');

  const res = await fetch(`/api/orders?${params.toString()}`, FRESH_FETCH_OPTIONS);
  if (!res.ok) return null;

  const data = await res.json();
  const mapped = (data.orders || []).map(toOrderRecord) as ShippedOrder[];
  const records = dedupeByOrderId(includeFba ? mapped : mapped.filter(isNonFbaRecord));
  const orderRecord = records[0] ?? null;
  if (!orderRecord) return null;

  const shippedSearchKey = String(orderRecord.order_id || orderId).trim();
  if (!shippedSearchKey || !enrichFromShipped) return orderRecord;

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
  pickerId,
  staffId,
  strictSearchScope = false,
  stage,
  blockedOnly = false,
  pair,
  queue,
  limit,
  pickedBy,
  orderFrom,
  orderTo,
  shipByFrom,
  shipByTo,
}: {
  searchQuery?: string;
  packedBy?: number;
  /** `?pickerId` — the order's ORDER/PICK assignee. */
  pickerId?: number;
  staffId?: number;
  strictSearchScope?: boolean;
  stage?: 'pending' | 'tested' | 'packed';
  blockedOnly?: boolean;
  /** Shortage desk lens (`?pair=po`) — forwarded as `pair`; the server implies blockedOnly. */
  pair?: DeskPairFilter;
  /** To-ship lens (`?queue=pick`) — forwarded as `queue`; the server implies inWarehouse. */
  queue?: DeskQueueFilter;
  limit?: number;
  /** `?pickedBy` — the staffer who picked the order. */
  pickedBy?: number;
  /** Order-date / ship-by windows — warehouse civil days (YYYY-MM-DD), inclusive. */
  orderFrom?: string;
  orderTo?: string;
  shipByFrom?: string;
  shipByTo?: string;
}) {
  const params = new URLSearchParams();
  if (searchQuery.trim()) params.set('q', searchQuery.trim());
  if (packedBy !== undefined) params.set('packedBy', String(packedBy));
  if (pickerId !== undefined) params.set('pickerId', String(pickerId));
  if (staffId !== undefined) params.set('staff', String(staffId));
  if (pickedBy !== undefined) params.set('pickedBy', String(pickedBy));
  if (orderFrom) params.set('orderFrom', orderFrom);
  if (orderTo) params.set('orderTo', orderTo);
  if (shipByFrom) params.set('shipByFrom', shipByFrom);
  if (shipByTo) params.set('shipByTo', shipByTo);
  const scoped = !searchQuery.trim() || strictSearchScope;
  if (scoped) params.set('inWarehouse', 'true');
  if (blockedOnly) params.set('blockedOnly', 'true');
  if (pair) params.set(DESK_PAIR_PARAM, pair);
  if (queue) params.set(DESK_QUEUE_PARAM, queue);
  // Phase 1: on the scoped, non-search fulfillment load, request the thin queue
  // projection and push the coarse stage facet to SQL. A search stays full-shape
  // (the route ignores listShape when `q` is present) for match highlighting.
  const bounded = scoped && !searchQuery.trim();
  if (scoped && !searchQuery.trim()) {
    params.set('listShape', 'queue');
    if (stage) params.set('stage', stage);
  }
  if (!bounded || limit == null || limit <= 0) {
    const res = await fetch(`/api/orders?${params.toString()}`, FRESH_FETCH_OPTIONS);
    if (!res.ok) throw new Error('Failed to fetch unshipped orders');
    const data = await res.json();
    return normalizeUnshippedOrdersPayload(data.orders || []);
  }

  // Phase 2: bounded page, read in fixed CHUNKS along the server's keyset
  // cursor. The route clamps `limit` to 500, so asking for "the first 600" in
  // one request silently returned 500 and "Load more" could never pass them.
  // Fixed chunk + cursor also keeps each chunk's server cache key stable: a
  // "Load more" re-reads earlier chunks as cache HITs and pays only for the new one.
  const rows: unknown[] = [];
  let cursor: string | null = null;
  while (rows.length < limit) {
    const page = new URLSearchParams(params);
    page.set('limit', String(Math.min(UNSHIPPED_FETCH_CHUNK, limit - rows.length)));
    if (cursor) page.set('cursor', cursor);
    const res = await fetch(`/api/orders?${page.toString()}`, FRESH_FETCH_OPTIONS);
    if (!res.ok) throw new Error('Failed to fetch unshipped orders');
    const data = (await res.json()) as { orders?: unknown[]; nextCursor?: string | null };
    rows.push(...(data.orders ?? []));
    cursor = data.nextCursor ?? null;
    if (!cursor) break;
  }
  return normalizeUnshippedOrdersPayload(rows);
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
export async function fetchOrderLookupData(
  searchQuery: string,
  { includeFba = false }: { includeFba?: boolean } = {},
): Promise<ShippedOrder[]> {
  const q = searchQuery.trim();
  if (!q) return [];
  const params = new URLSearchParams({ q, includeShipped: 'true' });
  const res = await fetch(`/api/orders?${params.toString()}`, FRESH_FETCH_OPTIONS);
  if (!res.ok) throw new Error('Failed to search orders');
  const data = await res.json();
  return normalizeUnshippedOrdersPayload(data.orders || [], { includeFba });
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
  carrier,
  statusCategory,
  exceptionsOnly = false,
  searchTerm = '',
  shippedTime = null,
  pickedBy,
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
  /** Shipped desk view filters, answered in SQL by `/api/packerlogs` (one predicate with the facet counts). */
  carrier?: string | null;
  statusCategory?: string | null;
  exceptionsOnly?: boolean;
  /** The desk's find text, answered in SQL by `/api/packerlogs?q=`. */
  searchTerm?: string;
  /** Exact shipped-instant window (`?dateFrom/dateTo` + `?timeFrom/timeTo`); null = none. */
  shippedTime?: { dateFrom: string; dateTo: string; timeFrom?: string; timeTo?: string } | null;
  /** `?pickedBy` — the order's picker. */
  pickedBy?: number;
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
  if (carrier) params.set('carrier', carrier);
  if (statusCategory) params.set('statusCategory', statusCategory);
  if (exceptionsOnly) params.set('exceptions', '1');
  if (searchTerm.trim()) params.set('q', searchTerm.trim());
  if (shippedTime) {
    params.set('dateFrom', shippedTime.dateFrom);
    params.set('dateTo', shippedTime.dateTo);
    if (shippedTime.timeFrom) params.set('timeFrom', shippedTime.timeFrom);
    if (shippedTime.timeTo) params.set('timeTo', shippedTime.timeTo);
  }
  if (pickedBy !== undefined) params.set('pickedBy', String(pickedBy));
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
  packer_photos_url: Array<{ id: number; url: string; uploadedAt: string }>;
}

/** Fetch the deferred (work_assignments deadline + photos) fields for a page of shipped rows so the spine-first table can fill them… */
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
