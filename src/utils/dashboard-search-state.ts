'use client';

import type { ShippedOrder } from '@/types/orders';
import type { ShippedDetailsContext } from '@/utils/events';

/** To-ship desk view. */
export type DashboardOrderView = 'unshipped' | 'picked' | 'packed' | 'shipped';
type DashboardCacheEntry = readonly [unknown, unknown];

/** Band-1 / Band-3 triage facets on the in-warehouse desk. */
export type ToShipTriageFacet =
  | 'all'
  | 'must_ship'
  | 'urgent'
  | 'blocked'
  | 'awaiting_customer'
  /** The CAGED set (`?cage=1`) — orders held out of the live queue until their release gates pass. */
  | 'caged';

export const TO_SHIP_TRIAGE_FACET_LABEL: Record<ToShipTriageFacet, string> = {
  all: 'All',
  must_ship: 'Must ship',
  urgent: 'Urgent',
  blocked: 'Out of stock',
  awaiting_customer: 'Awaiting customer',
  caged: 'Caged',
};

export interface DashboardSelectionSnapshot {
  order: ShippedOrder;
  context: ShippedDetailsContext;
  savedAt: number;
}

interface DashboardAssignmentUpdateDetail {
  orderIds?: unknown[];
  pickerId?: number | null;
  packerId?: number | null;
  shipByDate?: string | null;
  outOfStock?: string | null;
  isOutOfStock?: boolean;
  notes?: string | null;
  shippingTrackingNumber?: string | null;
  itemNumber?: string | null;
  condition?: string | null;
}

/** Params the legacy `?warranty=` redirect forwards to Support. */
export const SUPPORT_WARRANTY_FORWARDED_PARAMS = [
  'open',
  'wstatus',
  'wexp',
  'search',
] as const;

export function buildSupportWarrantyRedirectSearch(
  searchParams: Pick<URLSearchParams, 'get'>
): string {
  const next = new URLSearchParams();
  next.set('mode', 'warranty');
  for (const key of SUPPORT_WARRANTY_FORWARDED_PARAMS) {
    const value = searchParams.get(key);
    if (value) next.set(key, value);
  }
  return next.toString();
}

/**
 * Resolve the desk view from the URL. Legacy `?tested` / `?packed` / `?shipped`
 * presence flags collapse to the single in-warehouse desk (`unshipped`); stage
 * refine rides `?stage=` instead of a tab.
 */
export function getDashboardOrderViewFromSearch(
  _searchParams: Pick<URLSearchParams, 'has' | 'get'>
): DashboardOrderView {
  return 'unshipped';
}

/**
 * Pending (To Ship) is grid-only. Legacy `?view=grid|board` is stripped on
 * normalize — kept as a read helper so old bookmarks resolve without a switcher.
 */
export function getDashboardPendingLayoutFromSearch(
  _searchParams: Pick<URLSearchParams, 'get'>
): 'grid' {
  return 'grid';
}

/** Display labels — legacy tab names kept for saved-view copy / tests. */
const DASHBOARD_ORDER_VIEW_LABEL: Record<DashboardOrderView, string> = {
  unshipped: 'Allocate',
  picked: 'Picked',
  packed: 'Packed',
  shipped: 'Shipped',
};

/** The in-warehouse desk is always the To-ship surface. */
function isPrePackOrderView(view: DashboardOrderView): boolean {
  return view === 'unshipped' || view === 'picked' || view === 'packed';
}

/**
 * Read the active triage facet from URL params.
 * Precedence: awaiting customer → blocked → urgent → must ship → all.
 */
export function getToShipTriageFacetFromSearch(
  searchParams: Pick<URLSearchParams, 'get' | 'has'>,
): ToShipTriageFacet {
  // Caged wins the precedence chain: it swaps the desk's whole data source, so
  // a stray `?late=1` riding along in a pasted link must not out-rank it.
  if (searchParams.get('cage') === '1' || searchParams.get('cage') === 'true') {
    return 'caged';
  }
  const rowFlag = String(searchParams.get('rowFlag') || '').trim().toLowerCase();
  if (rowFlag === 'awaiting_customer') return 'awaiting_customer';
  const ustatus = String(searchParams.get('ustatus') || '').trim().toUpperCase();
  if (ustatus === 'BLOCKED') return 'blocked';
  if (
    searchParams.get('attention') === '1' ||
    searchParams.get('attention') === 'true'
  ) {
    return 'urgent';
  }
  if (searchParams.get('late') === '1' || searchParams.get('late') === 'true') {
    return 'must_ship';
  }
  return 'all';
}

/** Apply a triage facet onto a copy of search params (mutates + returns). */
export function applyToShipTriageFacet(
  params: URLSearchParams,
  facet: ToShipTriageFacet,
): URLSearchParams {
  params.delete('late');
  params.delete('attention');
  params.delete('ustatus');
  params.delete('rowFlag');
  params.delete('cage');
  // Facets own the refine; clear lifecycle presence flags + stage tab leftovers.
  params.delete('tested');
  params.delete('packed');
  params.delete('shipped');
  params.delete('pending');
  params.delete('stage');
  switch (facet) {
    case 'must_ship':
      params.set('late', '1');
      break;
    case 'urgent':
      params.set('attention', '1');
      break;
    case 'blocked':
      params.set('ustatus', 'BLOCKED');
      break;
    case 'awaiting_customer':
      params.set('rowFlag', 'awaiting_customer');
      break;
    case 'caged':
      params.set('cage', '1');
      break;
    case 'all':
    default:
      break;
  }
  params.set('unshipped', '');
  return params;
}

/** After marking out of stock, land on the Pending stage — BLOCKED belongs there with unlabeled / unpicked work, not on Picked. */
function applyToShipStageAfterOutOfStock(params: URLSearchParams): boolean {
  const stage = String(params.get('stage') || '').trim().toLowerCase();
  const ustatus = String(params.get('ustatus') || '').trim().toUpperCase();
  let changed = false;
  if (stage === 'picked') {
    params.set('stage', 'pending');
    changed = true;
  }
  if (ustatus === 'PICKED') {
    params.delete('ustatus');
    changed = true;
  }
  return changed;
}

export function normalizeDashboardOrderViewParams(
  params: URLSearchParams,
  preferredView?: DashboardOrderView
): DashboardOrderView {
  // Legacy tab bookmarks → stage facet on the unified desk.
  const fromLegacy =
    preferredView ??
    (params.has('shipped')
      ? 'shipped'
      : params.has('packed')
        ? 'packed'
        : params.has('tested')
          ? 'picked'
          : 'unshipped');

  params.delete('unshipped');
  params.delete('pending');
  params.delete('tested');
  params.delete('packed');
  params.delete('shipped');
  params.delete('fba');
  params.delete('warranty');
  params.delete('open');
  params.delete('wstatus');
  params.delete('wexp');
  params.delete('layout');
  params.delete('view');
  params.delete('ostatus');
  params.delete('exceptions');

  // Map retired tabs onto stage refine (not a second list).
  if (fromLegacy === 'picked' && !params.get('stage')) {
    params.set('stage', 'picked');
  } else if (fromLegacy === 'packed' && !params.get('stage')) {
    params.set('stage', 'packed');
  }
  // `?shipped` bookmarks land on the in-warehouse desk; dock history is Scan-out.

  params.set('unshipped', '');
  return 'unshipped';
}

export function parseDashboardOpenOrderId(raw: string | null | undefined): number | null {
  const value = Number(String(raw || '').trim());
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function normalizeDashboardDetailsContext(
  order: Pick<ShippedOrder, 'packed_at'>,
  context?: ShippedDetailsContext
): ShippedDetailsContext {
  if (context) return context;
  return order.packed_at ? 'shipped' : 'queue';
}

export function extractOrdersFromDashboardCacheEntry(value: unknown): ShippedOrder[] {
  if (Array.isArray(value)) return value as ShippedOrder[];
  if (!value || typeof value !== 'object') return [];

  const record = value as { orders?: unknown; results?: unknown; shipped?: unknown };
  if (Array.isArray(record.orders)) return record.orders as ShippedOrder[];
  if (Array.isArray(record.results)) return record.results as ShippedOrder[];
  if (Array.isArray(record.shipped)) return record.shipped as ShippedOrder[];
  return [];
}

export function findDashboardSelectedOrderInCache(
  cachedEntries: DashboardCacheEntry[],
  openOrderId: number
): { order: ShippedOrder; context: ShippedDetailsContext } | null {
  for (const [, value] of cachedEntries) {
    const match = extractOrdersFromDashboardCacheEntry(value).find((record) => Number(record.id) === openOrderId);
    if (match) {
      const context = normalizeDashboardDetailsContext(match);
      return { order: match, context };
    }
  }

  return null;
}

export function resolveDashboardSelectedOrderCandidate(args: {
  openOrderId: number;
  cachedEntries: DashboardCacheEntry[];
  storedSelection: DashboardSelectionSnapshot | null;
}): { order: ShippedOrder; context: ShippedDetailsContext } | null {
  const cached = findDashboardSelectedOrderInCache(args.cachedEntries, args.openOrderId);
  if (cached) return cached;

  if (Number(args.storedSelection?.order?.id) === args.openOrderId && args.storedSelection?.order) {
    return {
      order: args.storedSelection.order,
      context: args.storedSelection.context,
    };
  }

  return null;
}

export function patchDashboardSelectedOrderFromAssignment(
  current: ShippedOrder | null,
  detail: DashboardAssignmentUpdateDetail
): ShippedOrder | null {
  if (!current) return current;

  const idSet = new Set((detail.orderIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id)));
  if (idSet.size === 0 || !idSet.has(Number(current.id))) return current;

  const next: ShippedOrder & Record<string, unknown> = { ...current };
  if (detail.pickerId !== undefined) next.picker_id = detail.pickerId;
  if (detail.packerId !== undefined) next.packer_id = detail.packerId;
  if (detail.shipByDate !== undefined) next.ship_by_date = detail.shipByDate;
  if (detail.outOfStock !== undefined || detail.isOutOfStock !== undefined) {
    next.is_out_of_stock =
      detail.isOutOfStock !== undefined
        ? Boolean(detail.isOutOfStock)
        : Boolean(String(detail.outOfStock || '').trim());
  }
  if (detail.notes !== undefined) next.notes = detail.notes ?? '';
  if (detail.shippingTrackingNumber !== undefined) next.shipping_tracking_number = detail.shippingTrackingNumber;
  if (detail.itemNumber !== undefined) next.item_number = detail.itemNumber;
  if (detail.condition !== undefined) next.condition = detail.condition ?? '';
  return next;
}
