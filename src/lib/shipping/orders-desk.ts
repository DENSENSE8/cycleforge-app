/** Shipping · To-ship desk — `/shipping/orders`. */

export const SHIPPING_ORDERS_PATH = '/shipping/orders';

/**
 * Shortage / need-to-buy workbench. A Shipping PEER, not a To-ship facet:
 * out-of-stock lines are the procurement queue. Reads as Pending in the tab.
 */
export const SHIPPING_SHORTAGE_PATH = '/shipping/shortage';
/** The order-exception workbench. */
export const SHIPPING_EXCEPTIONS_PATH = '/shipping/exceptions';
/** Label intake — the V1 label-ingestion ledger (upload/watch a carrier label PDF → exact order match or quarantine → apply to packed units). */
export const SHIPPING_LABEL_INTAKE_PATH = '/shipping/label-intake';

/** Wire value that selects Support Inquiries context on the shared desk. */
export const ORDERS_DESK_SUPPORT_CONTEXT = 'support' as const;

/** Query key for Support Inquiries context on the shared desk (`?context=`). */
export const ORDERS_DESK_CONTEXT_KEY = 'context';

export type OrdersDeskContext = typeof ORDERS_DESK_SUPPORT_CONTEXT | null;

/** Params that belong only to the Support Inquiries context. */
const SUPPORT_CONTEXT_ONLY_PARAMS = ['createTicket'] as const;

export function parseOrdersDeskContext(
  raw: string | null | undefined,
): OrdersDeskContext {
  return String(raw || '').trim().toLowerCase() === ORDERS_DESK_SUPPORT_CONTEXT
    ? ORDERS_DESK_SUPPORT_CONTEXT
    : null;
}

/**
 * Clear params that belong to the other context. Callers write `context`
 * themselves, then pass the next params through this helper.
 */
function clearCrossContextParams(
  params: URLSearchParams,
  nextContext: OrdersDeskContext,
): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  if (nextContext !== ORDERS_DESK_SUPPORT_CONTEXT) {
    for (const key of SUPPORT_CONTEXT_ONLY_PARAMS) next.delete(key);
  }
  return next;
}

/**
 * Apply a context switch onto a copy of the current search params.
 * Fulfillment clears `context`; Support sets `context=support`.
 */
export function applyOrdersDeskContext(
  searchParams: URLSearchParams,
  context: OrdersDeskContext,
): URLSearchParams {
  const next = clearCrossContextParams(searchParams, context);
  if (context === ORDERS_DESK_SUPPORT_CONTEXT) {
    next.set(ORDERS_DESK_CONTEXT_KEY, ORDERS_DESK_SUPPORT_CONTEXT);
  } else {
    next.delete(ORDERS_DESK_CONTEXT_KEY);
  }
  return next;
}

/** Canonical To-ship desk href (optional support context + open order). */
export function shippingOrdersHref(opts?: {
  context?: OrdersDeskContext;
  openOrderId?: number | null;
  createTicket?: boolean;
}): string {
  const params = new URLSearchParams();
  if (opts?.context === ORDERS_DESK_SUPPORT_CONTEXT) {
    params.set(ORDERS_DESK_CONTEXT_KEY, ORDERS_DESK_SUPPORT_CONTEXT);
  }
  const id = Number(opts?.openOrderId);
  if (Number.isFinite(id) && id > 0) params.set('openOrderId', String(id));
  if (opts?.createTicket) params.set('createTicket', '1');
  const qs = params.toString();
  return qs ? `${SHIPPING_ORDERS_PATH}?${qs}` : SHIPPING_ORDERS_PATH;
}

/**
 * True when `/dashboard` should 308 to the To-ship desk.
 * Sales (`?mode=sales|pickup|repairs`) and inbound redirects stay on other doors.
 */
export function isDashboardOutboundOrdersUrl(
  pathname: string,
  searchParams: Pick<URLSearchParams, 'get' | 'has'>,
): boolean {
  if (pathname !== '/dashboard' && pathname !== '/dashboard/') return false;
  const mode = String(searchParams.get('mode') || '')
    .trim()
    .toLowerCase();
  if (
    mode === 'sales' ||
    mode === 'pickup' ||
    mode === 'repairs' ||
    mode === 'inbound' ||
    mode === 'receiving' ||
    mode === 'search'
  ) {
    return false;
  }
  // Legacy warranty / fba presence flags still client-redirect; leave them.
  if (searchParams.has('warranty') || searchParams.has('fba')) return false;
  return true;
}
