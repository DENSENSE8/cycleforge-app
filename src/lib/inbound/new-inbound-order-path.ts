/**
 * `/incoming/new` — the standalone inbound-order form (the inbound twin of
 * `/orders/new`). `?type=` picks the order type the form opens on; the type is
 * a classifier on the one form (PO · Return · Trade-in · Pickup), not a
 * different form.
 */

import {
  AUTHORED_INBOUND_ORDER_TYPES,
  type AuthoredInboundOrderType,
} from '@/lib/inbound/inbound-order-draft';

export const NEW_INBOUND_ORDER_PATH = '/incoming/new';
export const INBOUND_ORDER_TYPE_PARAM = 'type';

export function newInboundOrderHref(type: AuthoredInboundOrderType): string {
  return `${NEW_INBOUND_ORDER_PATH}?${INBOUND_ORDER_TYPE_PARAM}=${type}`;
}

/** `?type=` → the order type; anything unknown or missing opens a PO. */
export function parseInboundOrderTypeParam(raw: string | null | undefined): AuthoredInboundOrderType {
  const value = raw?.trim().toUpperCase();
  return (AUTHORED_INBOUND_ORDER_TYPES as readonly string[]).includes(value ?? '')
    ? (value as AuthoredInboundOrderType)
    : 'PO';
}
