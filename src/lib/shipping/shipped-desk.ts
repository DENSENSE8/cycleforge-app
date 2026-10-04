/** Fulfillment · Fulfilled — `/fulfilled`. `/shipping/shipped` redirects here. */

import { OUTBOUND_SHIPPED_VIEW } from '@/lib/triage/views/outbound-shipped';

export const SHIPPING_SHIPPED_PATH = '/fulfilled';

/** Saved views of this page. Presets of the sidebar params, never a second desk. */
export const FULFILLED_VIEWS = [
  { id: 'all', label: 'All', params: { view: 'all', shippedFilter: 'all', statusCategory: null } },
  { id: 'online', label: 'Online', params: { view: 'online', shippedFilter: 'orders', statusCategory: null } },
  { id: 'fba', label: 'FBA', params: { view: 'fba', shippedFilter: 'fba', statusCategory: null } },
  { id: 'sku', label: 'SKU', params: { view: 'sku', shippedFilter: 'sku', statusCategory: null } },
  { id: 'delivered', label: 'Delivered', params: { view: 'delivered', shippedFilter: null, statusCategory: 'DELIVERED' } },
] as const;

export type FulfilledViewId = (typeof FULFILLED_VIEWS)[number]['id'];

function isFulfilledViewId(id: string): id is FulfilledViewId {
  return FULFILLED_VIEWS.some((view) => view.id === id);
}

/**
 * Which saved view a Fulfilled URL is on. `?view=` wins; a bookmark that only
 * names the preset's filter still lights that view.
 */
export function resolveFulfilledView(params: Pick<URLSearchParams, 'get'>): FulfilledViewId {
  const named = (params.get('view') || '').trim();
  if (isFulfilledViewId(named)) return named;
  if ((params.get('statusCategory') || '').trim().toUpperCase() === 'DELIVERED') return 'delivered';
  switch ((params.get('shippedFilter') || '').trim()) {
    case 'orders':
      return 'online';
    case 'fba':
      return 'fba';
    case 'sku':
      return 'sku';
    default:
      return 'all';
  }
}

/** The keys a legacy shipped URL is allowed to carry onto the desk. */
const SHIPPED_DESK_CARRIED_PARAMS = [
  'search',
  'shippedFilter',
  'shippedSearchField',
  'shippedWeekOffset',
  'ostatus',
  'exceptions',
  'carrier',
  'statusCategory',
  'packedBy',
  'dateFrom',
  'dateTo',
  'allDates',
] as const;

type ParamsLike = Pick<URLSearchParams, 'get' | 'has'>;

/** True when this location is a legacy door onto shipment history. */
export function isLegacyShippedDeskUrl(pathname: string, params: ParamsLike): boolean {
  const isOrdersDesk = pathname === '/shipping/orders' || pathname === '/shipping/orders/';
  const isDashboard = pathname === '/dashboard' || pathname === '/dashboard/';
  if (!isOrdersDesk && !isDashboard) return false;
  if (!params.has('shipped')) return false;
  return String(params.get('context') || '').trim().toLowerCase() !== 'support';
}

/** The carried subset of a legacy URL's params, in desk vocabulary. */
export function buildShippedDeskSearch(params: ParamsLike): URLSearchParams {
  const next = new URLSearchParams();
  for (const key of SHIPPED_DESK_CARRIED_PARAMS) {
    const value = params.get(key);
    if (value != null && value !== '') next.set(key, value);
  }
  return next;
}

interface ShippedDeskHrefOptions {
  /** Find text — order number, tracking, SKU. */
  search?: string | null;
  /** Weeks back from the current one. 0 (this week) is the default paint. */
  weekOffset?: number | null;
  /** Explicit day window; wins over `weekOffset` in `resolveShippedQueryArgs`. */
  dateFrom?: string | null;
  dateTo?: string | null;
  shippedFilter?: 'all' | 'orders' | 'sku' | 'fba' | null;
  /** Outbound-state facet (e.g. `PACKED_STAGED` — the packer-log lane). */
  ostatus?: string | null;
}

/** Canonical Shipped desk href. No options = this week, everything. */
export function shippingShippedHref(opts: ShippedDeskHrefOptions = {}): string {
  const params = new URLSearchParams();
  const search = String(opts.search ?? '').trim();
  if (search) params.set('search', search);
  const weekOffset = Number(opts.weekOffset);
  if (Number.isFinite(weekOffset) && weekOffset > 0) {
    params.set('shippedWeekOffset', String(Math.floor(weekOffset)));
  }
  if (opts.dateFrom) params.set('dateFrom', opts.dateFrom);
  if (opts.dateTo) params.set('dateTo', opts.dateTo);
  if (opts.shippedFilter) params.set('shippedFilter', opts.shippedFilter);
  if (opts.ostatus) params.set('ostatus', opts.ostatus);
  const qs = params.toString();
  return qs ? `${SHIPPING_SHIPPED_PATH}?${qs}` : SHIPPING_SHIPPED_PATH;
}

/** Today's window on the Shipped desk — where To-ship's "Shipped today" count hands off. */
export function shippedTodayHref(todayDateKey: string): string {
  return shippingShippedHref({ dateFrom: todayDateKey, dateTo: todayDateKey });
}

/**
 * Every open unmatched scan on the Fulfilled desk — a pack scan or a dock
 * scan-out that matched no order — across all dates (the Unmatched status pill).
 */
export function shippedUnmatchedHref(): string {
  const params = new URLSearchParams({ allDates: '1', [OUTBOUND_SHIPPED_VIEW.chips.param]: 'UNMATCHED' });
  return `${SHIPPING_SHIPPED_PATH}?${params.toString()}`;
}
