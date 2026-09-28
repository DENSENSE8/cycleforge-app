/**
 * `GET /api/orders` query contract — the URL → typed query parse and the
 * Upstash cache key derived from it. Pure (no DB), so the key's completeness
 * is testable: the key is built from EVERY parsed field, which is what keeps a
 * new param (or `limit`/`cursor`, the 2026-09-26 bug) from sharing a cache
 * entry with a request it does not answer.
 */

import { createCacheLookupKey } from '@/lib/cache/upstash-cache';
import { parsePackedDateKey } from '@/lib/packed/packed-filters';
import { SHIPMENT_STATUS_CATEGORIES } from '@/lib/order-lifecycle';
import {
  readDeskRefinements,
  readDeskViewFilters,
  type DeskPairFilter,
  type DeskQueueFilter,
  type DeskRefinements,
} from '@/lib/orders/desk-view-filters';

export type OrdersListStage = 'pending' | 'picked' | 'packed';

/** Keyset cursor over the list ORDER BY (`deadline_at`, `id`). */
export interface OrdersListCursor {
  d: string | null;
  id: number;
}

/** `DeskRefinements` = `packedBy` / `pickerId` / `pickedBy` / `orderFrom|To` / `shipByFrom|To`. */
export interface OrdersListQuery extends DeskRefinements {
  /** `orderId=` — single-row mode (deep links); NaN when absent/invalid. */
  orderIdFilter: number;
  singleOrderMode: boolean;
  status: string | null;
  assignedTo: string | null;
  query: string;
  hasSearchQuery: boolean;
  weekStart: string;
  weekEnd: string;
  packedDateFrom: string;
  packedDateTo: string;
  assignmentStatus: string;
  shipByDate: string;
  /** Universal staff filter (P1-WORK-02): packer OR tech assignee. */
  staffFilterId: number | null;
  includeShipped: boolean;
  shippedOnly: boolean;
  /** Only orders with an order-grain pack fact. */
  packedOnly: boolean;
  /** Exclude orders with an order-grain pack fact. */
  excludePacked: boolean;
  /** Only orders without a shipment (Outbound · Labels queue). */
  awaitingOnly: boolean;
  /** Not-yet-packed queue incl. unlabeled rows, `o.id DESC`. */
  fulfillmentScope: boolean;
  pairFilter: DeskPairFilter | null;
  queueFilter: DeskQueueFilter | null;
  pickQueue: boolean;
  poPaired: boolean;
  /** The To-ship desk scope (`sqlOrderInWarehouseToShip`); `queue=pick` implies it. */
  inWarehouse: boolean;
  /** Every unshipped out-of-stock order, label or not; `pair=po` implies it. */
  blockedOnly: boolean;
  /** Packed (PACK event) but no dock scan-out yet. */
  stagedOnly: boolean;
  exceptionsOnly: boolean;
  stallHours: number;
  carrierFilter: '' | 'UPS' | 'USPS' | 'FEDEX';
  statusCategoryFilter: string;
  /** `listShape=queue` thin projection (ignored for search / single-row). */
  queueShape: boolean;
  stageFilter: OrdersListStage | '';
  /** Page size (1..500); null = unbounded (legacy callers). */
  pageLimit: number | null;
  cursor: OrdersListCursor | null;
}

function parseCursor(raw: string | null): OrdersListCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as { d?: unknown; id?: unknown };
    if (parsed && Number.isFinite(Number(parsed.id))) {
      return { d: parsed.d == null ? null : String(parsed.d), id: Number(parsed.id) };
    }
  } catch {
    /* malformed cursor = first page */
  }
  return null;
}

export function encodeOrdersListCursor(cursor: OrdersListCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64');
}

export function parseOrdersListQuery(searchParams: URLSearchParams): OrdersListQuery {
  const orderIdRaw = searchParams.get('orderId');
  const orderIdFilter =
    orderIdRaw != null && /^\d+$/.test(orderIdRaw.trim()) ? Number(orderIdRaw.trim()) : NaN;
  const singleOrderMode = Number.isFinite(orderIdFilter) && orderIdFilter > 0;
  const query = searchParams.get('q') || '';
  const hasSearchQuery = Boolean(query.trim());
  const staffFilterRaw = searchParams.get('staff');
  const staffFilterId =
    staffFilterRaw && Number.isFinite(Number(staffFilterRaw)) && Number(staffFilterRaw) > 0
      ? Number(staffFilterRaw)
      : null;
  const { pair: pairFilter, queue: queueFilter } = readDeskViewFilters(searchParams);
  const pickQueue = queueFilter === 'pick';
  const poPaired = pairFilter === 'po';
  const stallHoursRaw = Number(searchParams.get('stallHours'));
  const carrierRaw = String(searchParams.get('carrier') || '').toUpperCase();
  const statusCategoryRaw = String(searchParams.get('statusCategory') || '').toUpperCase();
  const stageRaw = String(searchParams.get('stage') || '').toLowerCase();
  const limitRaw = Number(searchParams.get('limit'));

  return {
    orderIdFilter,
    singleOrderMode,
    status: searchParams.get('status'),
    assignedTo: searchParams.get('assignedTo'),
    query,
    hasSearchQuery,
    weekStart: searchParams.get('weekStart') || '',
    weekEnd: searchParams.get('weekEnd') || '',
    packedDateFrom: parsePackedDateKey(searchParams.get('dateFrom')) ?? '',
    packedDateTo: parsePackedDateKey(searchParams.get('dateTo')) ?? '',
    assignmentStatus: searchParams.get('assignmentStatus') || '',
    shipByDate: searchParams.get('shipByDate') || '',
    ...readDeskRefinements(searchParams),
    staffFilterId,
    includeShipped: searchParams.get('includeShipped') === 'true',
    shippedOnly: searchParams.get('shippedOnly') === 'true',
    packedOnly: searchParams.get('packedOnly') === 'true',
    excludePacked: searchParams.get('excludePacked') === 'true',
    awaitingOnly: searchParams.get('awaitingOnly') === 'true',
    fulfillmentScope: searchParams.get('fulfillmentScope') === 'true',
    pairFilter: pairFilter ?? null,
    queueFilter: queueFilter ?? null,
    pickQueue,
    poPaired,
    inWarehouse: searchParams.get('inWarehouse') === 'true' || pickQueue,
    blockedOnly: searchParams.get('blockedOnly') === 'true' || poPaired,
    stagedOnly: searchParams.get('stagedOnly') === 'true',
    exceptionsOnly: searchParams.get('exceptions') === '1' || searchParams.get('exceptions') === 'true',
    stallHours:
      Number.isFinite(stallHoursRaw) && stallHoursRaw > 0 && stallHoursRaw <= 720 ? Math.floor(stallHoursRaw) : 72,
    carrierFilter: carrierRaw === 'UPS' || carrierRaw === 'USPS' || carrierRaw === 'FEDEX' ? carrierRaw : '',
    statusCategoryFilter: (SHIPMENT_STATUS_CATEGORIES as readonly string[]).includes(statusCategoryRaw)
      ? statusCategoryRaw
      : '',
    // Every param below is ABSENT for non-queue callers, so their query and payload are unchanged.
    queueShape: searchParams.get('listShape') === 'queue' && !hasSearchQuery && !singleOrderMode,
    stageFilter: stageRaw === 'pending' || stageRaw === 'picked' || stageRaw === 'packed' ? stageRaw : '',
    pageLimit: Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 500) : null,
    cursor: parseCursor(searchParams.get('cursor')),
  };
}

/**
 * Bump when the membership SQL or the payload shape changes, so a payload
 * cached under the old rules cannot outlive the fix by a TTL.
 */
const ORDERS_LIST_CACHE_VERSION = 'orders_list_v4_desk_refinements';

/**
 * Cache key for one list read. Built from EVERY field of the parsed query —
 * a field added to {@link OrdersListQuery} is keyed automatically.
 */
export function ordersListCacheLookupKey(organizationId: string, q: OrdersListQuery): string {
  const fields: Record<string, string | number | boolean | null> = {};
  for (const [name, value] of Object.entries(q) as [keyof OrdersListQuery, OrdersListQuery[keyof OrdersListQuery]][]) {
    if (name === 'cursor') {
      const cursor = value as OrdersListCursor | null;
      fields.cursor = cursor ? `${cursor.d ?? ''}|${cursor.id}` : '';
    } else if (typeof value === 'number' && Number.isNaN(value)) {
      fields[name] = '';
    } else {
      fields[name] = value as string | number | boolean | null;
    }
  }
  return createCacheLookupKey({
    ...fields,
    organizationId,
    cacheVersion: ORDERS_LIST_CACHE_VERSION,
  });
}
