/**
 * Open a record's DETAILS the one way its triage card does (operator
 * 2026-10-04): the card's own desk, the card's own record param, so the
 * record opens in that desk's record plane over its list — never a scan
 * station, never a second detail surface.
 *
 * - an order: `/shipping/orders?openOrderId=<orders.id>` — what an
 *   OrderCardList card writes (`useDashboardSelectedOrder`); a shipped order
 *   opens on Fulfilled the same way (`/fulfilled?openOrderId=`);
 * - a receiving number: `/incoming?ref_in=<number>&openLine=<line id>` —
 *   what a PastedNumbersLedger card writes (`ReceivingLedgers.setOpenLine`);
 *   a number with no line yet opens its placeholder (`pastedNumberPlaceholderId`).
 *
 * The cards write their param through {@link setRecordDetailsParam}; every
 * other surface (the search bar's pasted list, the ⌘K palette, the full list
 * page) builds the href with {@link recordDetailsHref} and opens it with
 * {@link recordDetailsNavigation}: in place when that desk's list is the
 * page on screen, else a navigation that carries `recordBack` — the record
 * plane's close returns there (`DeskRecordPlane`).
 */

import { REF_IN_PARAM, parseRefInParam } from '@/lib/receiving/reconcile';
import { INCOMING_SURFACE_ROUTE } from '@/lib/receiving/surface-path';
import { pastedNumberPlaceholderId } from '@/lib/receiving/pasted-numbers';
import { SHIPPING_ORDERS_PATH } from '@/lib/shipping/orders-desk';
import { SHIPPING_SHIPPED_PATH } from '@/lib/shipping/shipped-desk';
import { canonicalizeTrackingKey } from '@/lib/zoho/call-reduction';

export type RecordDetailsTarget =
  /** `orderId` = `orders.id`; `shipped` opens it on Fulfilled. */
  | { kind: 'order'; orderId: number; shipped: boolean }
  /** A pasted receiving number: its line (any of its lines), or null for a number no line holds yet. */
  | { kind: 'receiving-number'; ref: string; lineId: number | null };

/** The record param each kind's card writes. */
export const RECORD_DETAILS_PARAM = {
  order: 'openOrderId',
  'receiving-number': 'openLine',
} as const satisfies Record<RecordDetailsTarget['kind'], string>;

/** Where the record plane's close returns after a record was opened from another page. */
export const RECORD_BACK_PARAM = 'recordBack';

/** A same-origin path, never a protocol-relative or absolute URL. */
export function isInternalPath(value: string | null | undefined): value is string {
  return Boolean(value && value.startsWith('/') && !value.startsWith('//'));
}

/** Write (or clear, with `null`) a card's open record on its desk's params — the cards' one writer. */
export function setRecordDetailsParam(
  params: URLSearchParams,
  kind: RecordDetailsTarget['kind'],
  id: number | null,
): URLSearchParams {
  const key = RECORD_DETAILS_PARAM[kind];
  if (id == null) params.delete(key);
  else params.set(key, String(id));
  return params;
}

/** The href that opens this record's details on its own desk. */
export function recordDetailsHref(target: RecordDetailsTarget): string {
  if (target.kind === 'order') {
    const params = setRecordDetailsParam(new URLSearchParams(), 'order', target.orderId);
    return `${target.shipped ? SHIPPING_SHIPPED_PATH : SHIPPING_ORDERS_PATH}?${params.toString()}`;
  }
  const params = new URLSearchParams({ [REF_IN_PARAM]: target.ref });
  const lineId = target.lineId ?? pastedNumberPlaceholderId(canonicalizeTrackingKey(target.ref));
  setRecordDetailsParam(params, 'receiving-number', lineId);
  return `${INCOMING_SURFACE_ROUTE}?${params.toString()}`;
}

export interface RecordDetailsNavigation {
  /** `replace` = the desk's list is on screen: only the record param moves (the card's own write). */
  mode: 'replace' | 'push';
  href: string;
}

/**
 * How to open `href` from the page at `here` (pathname + search). On the
 * record's own desk, with its list on screen (an Incoming pasted list that
 * holds the number), the record opens in place over that list. Anywhere
 * else it navigates there and carries `recordBack`, so closing the record
 * comes back to the page it was opened from.
 */
export function recordDetailsNavigation(href: string, here: { pathname: string; search: string }): RecordDetailsNavigation {
  const target = new URL(href, 'http://record.local');
  const current = new URLSearchParams(here.search);
  if (target.pathname === here.pathname) {
    const ref = target.searchParams.get(REF_IN_PARAM);
    const held = ref == null || parseRefInParam(current.get(REF_IN_PARAM)).keys.includes(canonicalizeTrackingKey(ref));
    if (held) {
      for (const key of Object.values(RECORD_DETAILS_PARAM)) {
        const value = target.searchParams.get(key);
        if (value != null) current.set(key, value);
      }
      const qs = current.toString();
      return { mode: 'replace', href: qs ? `${here.pathname}?${qs}` : here.pathname };
    }
  }
  const back = `${here.pathname}${here.search ? (here.search.startsWith('?') ? here.search : `?${here.search}`) : ''}`;
  target.searchParams.set(RECORD_BACK_PARAM, back);
  return { mode: 'push', href: `${target.pathname}?${target.searchParams.toString()}` };
}
