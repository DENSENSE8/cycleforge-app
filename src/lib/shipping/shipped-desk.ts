/** Fulfillment · Fulfilled — `/fulfilled` (the URL vocabulary is `fulfilled-params.ts`). `/shipping/shipped` redirects here. */

import {
  FULFILLED_CARRIER_PARAM,
  FULFILLED_FIND_PARAM,
  FULFILLED_FROM_PARAM,
  FULFILLED_PACKER_PARAM,
  FULFILLED_TO_PARAM,
} from '@/lib/outbound/fulfilled-params';
import { SHIPMENT_RECORD_PARAM } from '@/lib/shipments/shipment-record-types';

export const SHIPPING_SHIPPED_PATH = '/fulfilled';

/** A legacy shipped-history param → its Fulfilled name; anything else a legacy URL carries is dropped. */
const LEGACY_SHIPPED_PARAM_RENAMES: ReadonlyArray<readonly [string, string]> = [
  ['search', FULFILLED_FIND_PARAM],
  ['carrier', FULFILLED_CARRIER_PARAM],
  ['packedBy', FULFILLED_PACKER_PARAM],
  ['dateFrom', FULFILLED_FROM_PARAM],
  ['dateTo', FULFILLED_TO_PARAM],
];

type ParamsLike = Pick<URLSearchParams, 'get' | 'has'>;

/** True when this location is a legacy door onto shipment history. */
export function isLegacyShippedDeskUrl(pathname: string, params: ParamsLike): boolean {
  const isOrdersDesk = pathname === '/shipping/orders' || pathname === '/shipping/orders/';
  const isDashboard = pathname === '/dashboard' || pathname === '/dashboard/';
  if (!isOrdersDesk && !isDashboard) return false;
  if (!params.has('shipped')) return false;
  return String(params.get('context') || '').trim().toLowerCase() !== 'support';
}

/** The carried subset of a legacy URL's params, in Fulfilled's vocabulary. */
export function buildShippedDeskSearch(params: ParamsLike): URLSearchParams {
  const next = new URLSearchParams();
  for (const [legacy, name] of LEGACY_SHIPPED_PARAM_RENAMES) {
    const value = params.get(legacy)?.trim();
    if (value) next.set(name, value);
  }
  return next;
}

interface FulfilledHrefOptions {
  /** Find text — order number, tracking (last 8 too), SKU, title, customer. */
  find?: string | null;
  /** Shipped window, PT civil days (inclusive). Neither = the sheet's default window. */
  from?: string | null;
  to?: string | null;
}

/** Canonical Fulfilled href. No options = the default window, everything. */
export function shippingShippedHref(opts: FulfilledHrefOptions = {}): string {
  const params = new URLSearchParams();
  const find = String(opts.find ?? '').trim();
  if (find) params.set(FULFILLED_FIND_PARAM, find);
  if (opts.from) params.set(FULFILLED_FROM_PARAM, opts.from);
  if (opts.to) params.set(FULFILLED_TO_PARAM, opts.to);
  const qs = params.toString();
  return qs ? `${SHIPPING_SHIPPED_PATH}?${qs}` : SHIPPING_SHIPPED_PATH;
}

/** One package's record on Fulfilled (`?shipment=`) — where an exception on it is resolved. */
export function fulfilledShipmentHref(shipmentId: number): string {
  return `${SHIPPING_SHIPPED_PATH}?${new URLSearchParams({ [SHIPMENT_RECORD_PARAM]: String(shipmentId) })}`;
}
