/**
 * Shipping · Shipped desk — `/shipping/shipped`.
 *
 * Twin of {@link SHIPPING_ORDERS_PATH}'s module (`orders-desk.ts`), and the one
 * import SoT for every link that means *what already left*: the redirect matrix
 * in `proxy.ts`, the assistant's shipped hrefs, and the To-ship today strip's
 * "Shipped today" handoff.
 *
 * ## Why this is a desk and not a tab on To ship
 *
 * To ship answers "what do I act on"; Shipped answers "find and measure what
 * already left". They are different jobs with different shapes — one is an open
 * queue with stage verbs, the other is a date-windowed archive with find — and
 * mixing them on one table forces both into one interaction budget
 * (`docs/todo/shipping-desk-to-ship-prep-shipped-PLAN.md` §0).
 *
 * ## Dependency-free on purpose
 *
 * `proxy.ts` imports this, and that file is bundled for the **Edge** runtime —
 * it inlines its own constants rather than reaching into app modules for
 * exactly this reason. So nothing here imports anything: `shippedTodayHref`
 * takes the date key instead of calling `@/utils/date`, whose transitive
 * `date-fns-tz` + time-format store have no business in an edge bundle.
 *
 * ## The param contract
 *
 * Shipped state is the EXISTING shipped vocabulary — `resolveShippedQueryArgs`
 * in `@/lib/shipped-dashboard-params` stays the single resolver. This module
 * only knows which keys travel; it never re-parses them. That is what makes an
 * old `?shipped=&carrier=UPS&shippedWeekOffset=2` bookmark survive the move:
 * the redirect carries the same keys to the new path and the same resolver
 * reads them there.
 */

export const SHIPPING_SHIPPED_PATH = '/shipping/shipped';

/**
 * The keys a legacy shipped URL is allowed to carry onto the desk.
 *
 * Deliberately a keep-list, not a strip-list: `/shipping/orders?shipped=` and
 * `/dashboard?shipped=` both carry open-queue params (`stage`, `cage`,
 * `ustatus`, `openOrderId`) that mean nothing on an archive, and forwarding
 * them would land the operator on a history page wearing a queue's filters.
 * Everything here is declared by `SHIPPED_ROUTE_PARAMS`, so the boundary parse
 * on arrival is a no-op rather than a second, quieter strip.
 */
export const SHIPPED_DESK_CARRIED_PARAMS = [
  'search',
  'shippedFilter',
  'shippedSearchField',
  'shippedWeekOffset',
  'ostatus',
  'exceptions',
  'carrier',
  'statusCategory',
  'packedBy',
  'testedBy',
  'dateFrom',
  'dateTo',
  'allDates',
] as const;

type ParamsLike = Pick<URLSearchParams, 'get' | 'has'>;

/**
 * True when this location is a legacy door onto shipment history.
 *
 * `?shipped` is a bare PRESENCE flag (`utils/dashboard-search-state.ts`), so it
 * is read with `.has()` and never by value. The Support alias is excluded on
 * purpose: `/shipping/orders?context=support` is a ticket surface that happens
 * to sit on the orders desk, and stealing it to history would answer a question
 * nobody asked.
 */
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

export interface ShippedDeskHrefOptions {
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

/**
 * Today's window on the Shipped desk — where To-ship's "Shipped today" count
 * hands off.
 *
 * A single-day `dateFrom`/`dateTo` rather than the week, because the chip
 * counts today and a link that lands on a wider set than the number it was
 * printed on is a link that lies.
 *
 * `todayDateKey` is passed in rather than read here: the warehouse day is a
 * civil PST key (`getCurrentPSTDateKey`), and importing that would drag
 * `date-fns-tz` into the edge bundle this module is kept clean for.
 */
export function shippedTodayHref(todayDateKey: string): string {
  return shippingShippedHref({ dateFrom: todayDateKey, dateTo: todayDateKey });
}
