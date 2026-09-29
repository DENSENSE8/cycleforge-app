'use client';

import { ExceptionsDesk } from '@/components/exceptions/ExceptionsDesk';
import { useDeskSearch } from '@/lib/outbound/desk-search-store';
import { SHIPPING_EXCEPTIONS_PATH } from '@/lib/shipping/orders-desk';

/** The one lock this door wears — a stable reference, so the list's summary does not re-derive per render. */
const FULFILLMENT_LOCK = { domain: 'fulfillment' } as const;

/**
 * FBM › Exceptions — the Exceptions hub's ONE list, locked to Fulfillment
 * (FBM holds · Labels & docs · Paperwork; owner 2026-09-28 "one list, two
 * doors"). The Shipping sidebar's Find box is the desk store for this path,
 * never a URL param, so it is passed in as the list's query.
 */
export function FulfillmentExceptionsDoor() {
  const [search] = useDeskSearch(SHIPPING_EXCEPTIONS_PATH);
  return <ExceptionsDesk basePath={SHIPPING_EXCEPTIONS_PATH} lock={FULFILLMENT_LOCK} query={search} />;
}
