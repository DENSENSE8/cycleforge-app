/**
 * FBM desk views — the ONE definition of the FBM views. The sidebar section
 * (`resolveNavContext`), the `SIDEBAR_PAGE_NAV` `outbound` children and their
 * `resolveChild`, the FBM door href, identify's desk arm, the locator's buckets
 * and record links all read this registry; none keeps its own list.
 */

import { SHIPPING_EXCEPTIONS_PATH, SHIPPING_ORDERS_PATH, SHIPPING_SHORTAGE_PATH } from '@/lib/shipping/orders-desk';
import { SHIPPING_SHIPPED_PATH } from '@/lib/shipping/shipped-desk';
import { EXCEPTIONS_PATH, EXCEPTION_DOMAIN_PARAM, EXCEPTION_KIND_PARAM } from '@/lib/exceptions/types';

/** Views whose rows are `/api/orders` rows — `sqlDeskQueueScope(id)` is their membership. */
export type DeskQueueViewId = 'triage';

export type DeskViewId = DeskQueueViewId | 'exceptions' | 'shipped';

/**
 * Keys of `GET /api/orders/desk-counts`. `po` is the parked Shortage desk's
 * lens total (`/shipping/shortage?pair=po`, reachable by URL, not a view).
 */
export type DeskCountKey = 'exceptions' | 'po' | 'triage' | 'shippedToday';

/**
 * The `SIDEBAR_PAGE_NAV` `outbound` child a view IS (one child per view). The
 * child id is the key the org nav's hide / rename / order is stored under, so
 * it stays stable when a view's own id or label changes.
 */
export type DeskViewNavChild = 'orders' | 'exceptions' | 'shipped';

export interface DeskView {
  id: DeskViewId;
  label: string;
  navChild: DeskViewNavChild;
  /** The row source: `orders` rows (`/api/orders`), the Exceptions hub, or the packer-log Shipped list. */
  rows: 'orders' | 'exceptions' | 'shipments';
  pathname: string;
  /** Params that DEFINE the view. Every other param is the operator's own. */
  params: Readonly<Record<string, string>>;
  /** The param the view reads to open an order record. */
  recordParam: string;
  /** Permission the view's list needs — the nav child's gate. */
  requires: string;
  countKey: DeskCountKey;
  /** Placeholder of the sidebar search while this view is open. */
  searchScope: string;
  /** The view FBM opens on (exactly one). */
  landing?: true;
}

/** Shortage-desk pairing param — `pair=po` is the (parked) PO-paired lens of `/shipping/shortage`. */
export const DESK_PAIR_PARAM = 'pair';

/**
 * Paint order (owner 2026-09-29): Allocate · Exceptions. Allocate leads because
 * it is where FBM lands. Fulfilled is its own L1 (`id: 'fulfilled'`), not a
 * child of this list — the archive view stays here so identify and locate can
 * still open a package, but it is not painted under FBM.
 */
export const DESK_VIEWS: readonly DeskView[] = [
  {
    id: 'triage',
    label: 'Allocate',
    navChild: 'orders',
    rows: 'orders',
    pathname: SHIPPING_ORDERS_PATH,
    params: {},
    recordParam: 'openOrderId',
    requires: 'orders.view',
    countKey: 'triage',
    searchScope: 'Search orders to allocate',
    landing: true,
  },
  {
    id: 'exceptions',
    label: 'Exceptions',
    navChild: 'exceptions',
    rows: 'exceptions',
    pathname: SHIPPING_EXCEPTIONS_PATH,
    params: {},
    recordParam: 'order',
    requires: 'orders.view',
    countKey: 'exceptions',
    searchScope: 'Search exceptions',
  },
  {
    id: 'shipped',
    label: 'Fulfilled',
    navChild: 'shipped',
    rows: 'shipments',
    pathname: SHIPPING_SHIPPED_PATH,
    // Parent list is every package that left. Saved views (Online, FBA, SKU)
    // are the type facet, not a second desk.
    params: { shippedFilter: 'all' },
    recordParam: 'openOrderId',
    // `packing.view` because the archive IS the packer log: `/api/packerlogs`
    // already enforces it, and a view that 403s is worse than an absent one.
    requires: 'packing.view',
    countKey: 'shippedToday',
    searchScope: 'Search shipments',
  },
];

/** View ids in paint order. */
export const DESK_VIEW_ORDER: readonly DeskViewId[] = DESK_VIEWS.map((view) => view.id);

export function getDeskView(id: DeskViewId): DeskView {
  const view = DESK_VIEWS.find((v) => v.id === id);
  if (!view) throw new Error(`unknown desk view: ${id}`);
  return view;
}

function landingView(): DeskView {
  const landing = DESK_VIEWS.filter((view) => view.landing);
  if (landing.length !== 1) throw new Error(`FBM needs exactly one landing view, found ${landing.length}`);
  return landing[0];
}

/** The view FBM opens on — the FBM door and mode card link here. */
export const DESK_LANDING_VIEW: DeskView = landingView();

/** A view whose rows are `/api/orders` rows (its membership is `sqlDeskQueueScope`). */
export function isDeskQueueView(id: DeskViewId): id is DeskQueueViewId {
  return getDeskView(id).rows === 'orders';
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
 * Which view a location is on — the view whose pathname it is (every view
 * owns its own path). The parked `/shipping/shortage` is on no view.
 */
export function resolveDeskView(pathname: string | null): DeskViewId | null {
  if (!pathname) return null;
  return DESK_VIEWS.find((view) => onPath(pathname, view.pathname))?.id ?? null;
}

/**
 * The URL for a view. Switching views starts clean: only the view's defining
 * params travel — filters and the open record belong to the view being left.
 */
export function deskViewHref(id: DeskViewId): string {
  if (id === 'exceptions') {
    return `${EXCEPTIONS_PATH}?${new URLSearchParams({
      [EXCEPTION_DOMAIN_PARAM]: 'fulfillment',
      [EXCEPTION_KIND_PARAM]: 'fbm',
    })}`;
  }
  const view = getDeskView(id);
  const qs = new URLSearchParams(view.params).toString();
  return qs ? `${view.pathname}?${qs}` : view.pathname;
}
