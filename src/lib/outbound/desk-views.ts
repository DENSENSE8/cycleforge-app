/** Outbound desk views — the ONE registry the Shipping sidebar section (`resolveNavContext`) and the routing contract read. */

import {
  SHIPPING_EXCEPTIONS_PATH,
  SHIPPING_ORDERS_PATH,
  SHIPPING_SHORTAGE_PATH,
} from '@/lib/shipping/orders-desk';
import { SHIPPING_SHIPPED_PATH } from '@/lib/shipping/shipped-desk';

export type DeskViewId = 'exceptions' | 'po' | 'pick' | 'triage' | 'shipped';

/** Keys of `GET /api/orders/desk-counts`. */
export type DeskCountKey = 'exceptions' | 'po' | 'pick' | 'triage' | 'shippedToday';

/**
 * The `SIDEBAR_PAGE_NAV` `outbound` child a view hangs under. The child carries
 * the view's permission and the org nav's hide / rename / order, so the desk
 * views and the old tab row go through ONE pipeline. A child with two views
 * (`shortage` → PO paired · Pick list) is the sidebar's labelled group.
 */
export type DeskViewNavChild = 'exceptions' | 'shortage' | 'orders' | 'shipped';

export interface DeskView {
  id: DeskViewId;
  label: string;
  navChild: DeskViewNavChild;
  pathname: string;
  /** Params that DEFINE the view. Every other param is the operator's own. */
  params: Readonly<Record<string, string>>;
  countKey: DeskCountKey;
  /** Placeholder of the sidebar search while this view is open. */
  searchScope: string;
}

/** Shortage-desk pairing param — `pair=po` is the PO-paired view. */
export const DESK_PAIR_PARAM = 'pair';
/** To-ship queue lens — `queue=pick` is the pick list. */
export const DESK_QUEUE_PARAM = 'queue';

export const DESK_VIEWS: readonly DeskView[] = [
  {
    id: 'exceptions',
    label: 'Exceptions',
    navChild: 'exceptions',
    pathname: SHIPPING_EXCEPTIONS_PATH,
    params: {},
    countKey: 'exceptions',
    searchScope: 'Search exceptions',
  },
  {
    id: 'po',
    label: 'PO paired',
    navChild: 'shortage',
    pathname: SHIPPING_SHORTAGE_PATH,
    params: { [DESK_PAIR_PARAM]: 'po' },
    countKey: 'po',
    searchScope: 'Search PO-paired orders',
  },
  {
    id: 'pick',
    label: 'Pick list',
    navChild: 'shortage',
    pathname: SHIPPING_ORDERS_PATH,
    params: { [DESK_QUEUE_PARAM]: 'pick' },
    countKey: 'pick',
    searchScope: 'Search the pick list',
  },
  {
    id: 'triage',
    label: 'Allocate',
    navChild: 'orders',
    pathname: SHIPPING_ORDERS_PATH,
    params: {},
    countKey: 'triage',
    searchScope: 'Search orders to allocate',
  },
  {
    id: 'shipped',
    label: 'Shipped',
    navChild: 'shipped',
    pathname: SHIPPING_SHIPPED_PATH,
    // FBM's Shipped is merchant-fulfilled only (owner 2026-09-28): FBA prep
    // shipments live in FBA › Shipped, so the list, its counts and the URL all
    // carry `shippedFilter=orders` (the `orders-queries` non-FBA predicate).
    params: { shippedFilter: 'orders' },
    countKey: 'shippedToday',
    searchScope: 'Search shipments',
  },
];

/** Paint order: Exceptions · Picking (PO paired · Pick list) · Allocate · Shipped. */
export const DESK_VIEW_ORDER: readonly DeskViewId[] = ['exceptions', 'po', 'pick', 'triage', 'shipped'];

export function getDeskView(id: DeskViewId): DeskView {
  const view = DESK_VIEWS.find((v) => v.id === id);
  if (!view) throw new Error(`unknown desk view: ${id}`);
  return view;
}

function onPath(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** The four desk paths that mount the desk sidebar. */
export function isOutboundDeskPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    onPath(pathname, SHIPPING_EXCEPTIONS_PATH) ||
    onPath(pathname, SHIPPING_SHORTAGE_PATH) ||
    onPath(pathname, SHIPPING_ORDERS_PATH) ||
    onPath(pathname, SHIPPING_SHIPPED_PATH)
  );
}

/**
 * Which view a location is on. Bare `/shipping/shortage` is the PO-paired view
 * (the page redirects it to `?pair=po`; resolving it here keeps the sidebar lit
 * during that redirect).
 */
export function resolveDeskView(
  pathname: string | null,
  params: Pick<URLSearchParams, 'get'> | null,
): DeskViewId | null {
  if (!pathname) return null;
  if (onPath(pathname, SHIPPING_EXCEPTIONS_PATH)) return 'exceptions';
  if (onPath(pathname, SHIPPING_SHORTAGE_PATH)) return 'po';
  if (onPath(pathname, SHIPPING_SHIPPED_PATH)) return 'shipped';
  if (onPath(pathname, SHIPPING_ORDERS_PATH)) {
    return params?.get(DESK_QUEUE_PARAM) === 'pick' ? 'pick' : 'triage';
  }
  return null;
}

/**
 * The URL for a view. Switching views starts clean: only the view's defining
 * params travel — filters and the open record belong to the view being left.
 */
export function deskViewHref(id: DeskViewId): string {
  const view = getDeskView(id);
  const qs = new URLSearchParams(view.params).toString();
  return qs ? `${view.pathname}?${qs}` : view.pathname;
}
