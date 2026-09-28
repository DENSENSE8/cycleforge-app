/**
 * `/incoming/new` — the standalone inbound-order form (the inbound twin of
 * `/orders/new`). `?type=` picks the order type the form opens on; the type is
 * a classifier on the one form (PO · Return · Trade-in · Pickup), not a
 * different form.
 */

import { INBOUND_ORDER_TYPES, type InboundOrderType } from '@/lib/inbound/inbound-order-draft';

export const NEW_INBOUND_ORDER_PATH = '/incoming/new';
export const INBOUND_ORDER_TYPE_PARAM = 'type';

export function newInboundOrderHref(type: InboundOrderType): string {
  return `${NEW_INBOUND_ORDER_PATH}?${INBOUND_ORDER_TYPE_PARAM}=${type}`;
}

/** `?type=` → the order type; anything unknown or missing opens a PO. */
export function parseInboundOrderTypeParam(raw: string | null | undefined): InboundOrderType {
  const value = raw?.trim().toUpperCase();
  return (INBOUND_ORDER_TYPES as readonly string[]).includes(value ?? '') ? (value as InboundOrderType) : 'PO';
}
