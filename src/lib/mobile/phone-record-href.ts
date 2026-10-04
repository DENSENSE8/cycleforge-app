/**
 * A record href the server answered for the desk (the locator's `recordHref`)
 * as the phone opens it: the `/m` twin when the phone tree has one, otherwise
 * the desk href unchanged. Pure, so the mapping is testable without a router.
 */

import { withJobReturn } from './nav-trail';

/** `searchOrderFeedbackHref` (`/search?sel=order:<orders.id>`) — the order hub's row id. */
const ORDER_SEL = /^order:(\d+)$/;

/**
 * `recordHref` on the phone. An order opens its hub `/m/orders/<id>?by=id`
 * with `from` as the X's return; a record with no phone twin (the inbound
 * reconcile ledger `/incoming?…`) keeps its desk href.
 */
export function phoneRecordHref(recordHref: string, from: string): string {
  const url = new URL(recordHref, 'http://local');
  if (url.pathname === '/search') {
    const order = ORDER_SEL.exec(url.searchParams.get('sel') ?? '');
    if (order) return withJobReturn(`/m/orders/${order[1]}?by=id`, from);
  }
  return recordHref;
}
