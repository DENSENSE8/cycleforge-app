/**
 * The Shipping desk's paste-a-list URL vocabulary (`NavSearch.locate` for the
 * outbound locator). Pure — the route registry and the context builder import
 * it; the SQL lives in `./outbound`.
 */

import type { NavSearch } from '@/lib/nav/context/schema';
import { DESK_VIEW_ORDER, type DeskViewId } from '@/lib/outbound/desk-views';

/** The pasted list — the operator's strings, comma-joined. */
export const OUTBOUND_LOCATE_REFS_PARAM = 'refs';

/** The bucket filter over the pasted list — one desk view id. */
export const OUTBOUND_LOCATE_STATUS_PARAM = 'located';

/** The desk's own list gate (`/api/orders`, `/api/orders/exceptions`) — the locator's. */
export const OUTBOUND_LOCATE_PERMISSION = 'orders.view';

export const OUTBOUND_LOCATE: NonNullable<NavSearch['locate']> = {
  locator: 'outbound',
  param: OUTBOUND_LOCATE_REFS_PARAM,
  statusParam: OUTBOUND_LOCATE_STATUS_PARAM,
};

/** `?located=` values — the outbound bucket ids, in bucket order. */
export const OUTBOUND_LOCATE_STATUSES = DESK_VIEW_ORDER as readonly [DeskViewId, ...DeskViewId[]];
