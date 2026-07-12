'use client';

import type { ShippedOrder } from '@/types/orders';
import type { ShippedDetailsContext } from '@/utils/events';

// 'pending' removed — Awaiting+Pending merged into 'unshipped' (2026-06-13).
// getDashboardOrderViewFromSearch never returns 'pending'; all legacy ?pending
// URLs resolve to 'unshipped' at the URL-read layer.
//
// Lifecycle tabs (ops names → industry labels in the UI):
//   unshipped → "To Ship"  (labeled, not yet packed)
//   packed    → "Packed"   (PACKED_STAGED — staged, not yet left the dock)
//   shipped   → "Shipped"  (left warehouse / in carrier custody / delivered)
export type DashboardOrderView = 'unshipped' | 'packed' | 'shipped' | 'fba';
/**
 * UI grouping for the dashboard view pills. To Ship / Packed / Shipped share
 * outbound order data; FBA is a distinct data source and stays its own group.
 */
export type DashboardViewGroup = 'orders' | 'fba';
export type DashboardCacheEntry = readonly [unknown, unknown];

export interface DashboardSelectionSnapshot {
  order: ShippedOrder;
  context: ShippedDetailsContext;
  savedAt: number;
}

export interface DashboardAssignmentUpdateDetail {
  orderIds?: unknown[];
  testerId?: number | null;
  packerId?: number | null;
  shipByDate?: string | null;
  outOfStock?: string | null;
  notes?: string | null;
  shippingTrackingNumber?: string | null;
  itemNumber?: string | null;
  condition?: string | null;
}

/**
 * Build the Support warranty deep-link from a legacy `/dashboard?warranty=` URL.
 * Preserves open claim + filters + search for bookmark compatibility.
 */
export function buildSupportWarrantyRedirectSearch(
  searchParams: Pick<URLSearchParams, 'get'>
): string {
  const next = new URLSearchParams();
  next.set('mode', 'warranty');
  for (const key of ['open', 'wstatus', 'wexp', 'search'] as const) {
    const value = searchParams.get(key);
    if (value) next.set(key, value);
  }
  return next.toString();
}

export function getDashboardOrderViewFromSearch(
  searchParams: Pick<URLSearchParams, 'has'>
): DashboardOrderView {
  if (searchParams.has('shipped')) return 'shipped';
  if (searchParams.has('packed')) return 'packed';
  if (searchParams.has('fba')) return 'fba';
  // Legacy `?warranty` is redirected to Support by the dashboard page; treat as unshipped.
  // The merged pre-ship mode. `?unshipped`, the legacy `?pending` (Awaiting +
  // Pending are now one mode), and the bare default all resolve here.
  return 'unshipped';
}

export function getDashboardViewGroup(view: DashboardOrderView): DashboardViewGroup {
  return view === 'fba' ? 'fba' : 'orders';
}

/** Display labels for the outbound lifecycle slider (industry-standard wording). */
export const DASHBOARD_ORDER_VIEW_LABEL: Record<
  Exclude<DashboardOrderView, 'fba'>,
  string
> = {
  unshipped: 'To Ship',
  packed: 'Packed',
  shipped: 'Shipped',
};

export function normalizeDashboardOrderViewParams(
  params: URLSearchParams,
  preferredView?: DashboardOrderView
): DashboardOrderView {
  const nextView = preferredView ?? getDashboardOrderViewFromSearch(params);
  params.delete('unshipped');
  params.delete('pending');
  params.delete('packed');
  params.delete('shipped');
  params.delete('fba');
  params.delete('warranty');
  // Clear residual warranty params if any still ride on dashboard URLs.
  params.delete('open');
  params.delete('wstatus');
  params.delete('wexp');
  // Nested board layout was retired — lists only on To Ship / Packed / Shipped.
  params.delete('layout');
  // Cross-tab status filters are view-specific; clear so they don't bleed.
  if (nextView !== 'unshipped') {
    params.delete('ustatus');
    params.delete('stage');
    params.delete('late');
    params.delete('attention');
    params.delete('surface');
  }
  if (nextView === 'packed') {
    // Packed is the exact staged list — status chips don't apply.
    params.delete('ostatus');
    params.delete('exceptions');
  }
  if (nextView !== 'shipped' && nextView !== 'packed') {
    params.delete('ostatus');
  }
  params.set(nextView, '');
  return nextView;
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
  if (detail.testerId !== undefined) next.tester_id = detail.testerId;
  if (detail.packerId !== undefined) next.packer_id = detail.packerId;
  if (detail.shipByDate !== undefined) next.ship_by_date = detail.shipByDate;
  if (detail.outOfStock !== undefined) next.out_of_stock = detail.outOfStock;
  if (detail.notes !== undefined) next.notes = detail.notes ?? '';
  if (detail.shippingTrackingNumber !== undefined) next.shipping_tracking_number = detail.shippingTrackingNumber;
  if (detail.itemNumber !== undefined) next.item_number = detail.itemNumber;
  if (detail.condition !== undefined) next.condition = detail.condition ?? '';
  return next;
}
