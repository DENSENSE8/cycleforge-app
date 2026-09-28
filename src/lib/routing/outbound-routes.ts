/** Param ownership for the Shipping (Outbound) mode routes. */

import {
  OUTBOUND_MODE_PATHS,
  type OutboundMode,
} from '@/components/outbound/outbound-sidebar-shared';
import { parseFbaModeWire } from '@/lib/fba/fba-modes';
import { ORDER_EXCEPTION_CATEGORIES } from '@/lib/orders/order-exception-types';
import { DESK_PAIR_PARAM } from '@/lib/outbound/desk-views';
import {
  OUTBOUND_LOCATE_REFS_PARAM,
  OUTBOUND_LOCATE_STATUSES,
  OUTBOUND_LOCATE_STATUS_PARAM,
} from '@/lib/nav/locate/outbound-params';
import { parseRefInParam, serializeRefIn } from '@/lib/receiving/reconcile';
import {
  SHIPPING_EXCEPTIONS_PATH,
  SHIPPING_ORDERS_PATH,
  SHIPPING_SHORTAGE_PATH,
} from '@/lib/shipping/orders-desk';
import { SHIPPING_SHIPPED_PATH } from '@/lib/shipping/shipped-desk';
import { parseShippedSearchFieldWire } from '@/lib/shipped-search';
import { parseReadyWorkspaceTabWire } from '@/utils/ready-workspace-state';
import {
  defineRouteParams,
  paramCanonical,
  paramDateKey,
  paramEnum,
  paramFlag,
  paramPositiveInt,
  paramPresence,
  paramRoundTrip,
  paramText,
  paramTimeKey,
  type RouteParamsSpec,
} from './route-params';
import { TO_SHIP_QUEUE_FACET_PARAMS } from './to-ship-queue-params';

/** Sidebar triage controls every queue list reads (`QUEUE_CONTROLS` in nav pages). */
const QUEUE_TRIAGE_PARAMS = {
  /** Who ACTUALLY picked the order (pick facts), not the pick assignee. */
  pickedBy: paramPositiveInt,
  packedBy: paramPositiveInt,
  /** The order's ORDER/PICK assignee (the order-desk operator). */
  pickerId: paramPositiveInt,
  /** Ship-by and order-date windows — PT civil days, inclusive. */
  shipByFrom: paramDateKey,
  shipByTo: paramDateKey,
  orderFrom: paramDateKey,
  orderTo: paramDateKey,
} as const;

/**
 * The sidebar's paste-a-list on every desk view (`NavSearch.locate`,
 * `GET /api/nav/locate`): the pasted refs (deduped + capped, the Check's
 * splitter) and the bucket filter over them (a desk view id).
 */
const DESK_LOCATE_PARAMS = {
  [OUTBOUND_LOCATE_REFS_PARAM]: paramCanonical((raw) => serializeRefIn(parseRefInParam(raw).refs) || null),
  [OUTBOUND_LOCATE_STATUS_PARAM]: paramEnum(OUTBOUND_LOCATE_STATUSES),
} as const;

/** Every shipping mode reads the same operator-level bits. */
const SHIPPING_CARRIES = ['staff', 'staffId', 'colsort', 'coldir', 'pane', 'layout', 'weekOffset'] as const;

/** Search box + display sort are the same question on all shipping modes. */
const SHIPPING_COMMON = {
  q: paramText,
  sort: paramEnum(['priority', 'newest'] as const),
} as const;

/**
 * `/shipping/orders` — To-ship desk (Pending · Picked · Packed · Shipped).
 * Former `/dashboard` outbound board. Support › Inquiries aliases with
 * `?context=support` (+ `createTicket` for order-anchored ticket create).
 */
const ORDERS_ROUTE_PARAMS = defineRouteParams({
  route: SHIPPING_ORDERS_PATH,
  owns: {
    /** Support › Inquiries alias — ticket affordances on order focus. */
    context: paramEnum(['support'] as const),
    openOrderId: paramPositiveInt,
    createTicket: paramText,
    /**
     * Outbound lifecycle tabs — BARE presence flags (`?shipped`), selected by
     * `.has()` in `utils/dashboard-search-state.ts`, never by value.
     */
    unshipped: paramPresence,
    pending: paramPresence,
    packed: paramPresence,
    tested: paramPresence,
    shipped: paramPresence,
    /** Grid + inspector state. */
    open: paramPositiveInt,
    /** Queue display sort (not SHIPPING_COMMON priority/newest — column/server ids). */
    sort: paramText,
    dir: paramEnum(['asc', 'desc'] as const),
    rtab: paramText,
    search: paramText,
    /** Queue facets (stage · aging · attention · late · ustatus · rowFlag · cage). */
    ...TO_SHIP_QUEUE_FACET_PARAMS,
    /** Packing DESK/STAGING placement filter (Ready-to-Pack → To-ship). */
    packStation: paramPositiveInt,
    packPlaced: paramFlag,
    new: paramEnum(['true'] as const),
    /** Add-orders rail, opened on the method list rather than hand entry. */
    ingest: paramEnum(['true'] as const),
    /** Intake entry inline at the top of the order list (`OrderIntakeEntry`): `new` or a caged order id. */
    triage: paramText,
    /** To-ship Labels walk (`PaperworkWalkHost`). */
    paperwork: paramPositiveInt,
    /**
     * Desk-sidebar lens: `pick` = the pick list (not packed, not fully picked,
     * newest synced first). Filtered server-side via `GET /api/orders?queue=`.
     * MUST stay declared — hygiene drops undeclared keys on the next tick.
     */
    queue: paramEnum(['pick'] as const),
    /** Order card list (owner 2026-09-27): status chips (comma list) and the 1-based page. */
    cardStatus: paramText,
    page: paramPositiveInt,
    /** CSV import staging surface on the To-Ship desk (session draft in memory). */
    import: paramEnum(['csv'] as const),
    shippedFilter: paramEnum(['all', 'orders', 'sku', 'fba'] as const),
    shippedSearchField: paramRoundTrip(parseShippedSearchFieldWire),
    shippedWeekOffset: paramPositiveInt,
    ostatus: paramText,
    exceptions: paramFlag,
    carrier: paramText,
    statusCategory: paramText,
    ...DESK_LOCATE_PARAMS,
    ...QUEUE_TRIAGE_PARAMS,
    dateFrom: paramDateKey,
    dateTo: paramDateKey,
    /**
     * Packed intentional "no date window". MUST stay declared: hygiene drops
     * undeclared keys, the current-week seed would re-apply, and dismiss (X)
     * would no-op.
     */
    allDates: paramFlag,
    /** List | Drill layout (omit when list). Orthogonal to openOrderId. */
    olayout: paramEnum(['list', 'drill'] as const),
    drillOrder: paramText,
    /** Compare multi-pane (omit when single). Mutually exclusive with drill. */
    clayout: paramEnum(['single', 'split', 'quad'] as const),
    c0: paramText,
    c1: paramText,
    c2: paramText,
    c3: paramText,
  },
  carries: SHIPPING_CARRIES,
});

/* `/shipping/labels` — DELETED 2026-08-30 along with its route. */
/** `/shipping/fba` — Ready · Plan · Combine · Shipped inbound workbench. */
const FBA_ROUTE_PARAMS = defineRouteParams({
  route: OUTBOUND_MODE_PATHS.fba,
  owns: {
    ...SHIPPING_COMMON,
    /** Lifecycle stage tab. */
    fbaMode: paramRoundTrip(parseFbaModeWire),
    /** Ready-stage disposition facet (all / fba / prebox / hold). */
    rtab: paramRoundTrip(parseReadyWorkspaceTabWire),
    openShipmentId: paramPositiveInt,
    plan: paramText,
    draft: paramText,
    main: paramText,
    details: paramText,
    r: paramText,
    /** The FNSKU catalog rail's three keys (ex-Admin › Amazon Prep, reached as `?fbaMode=catalog`). */
    search: paramText,
    /** Selected FNSKU — the catalog pane's detail key. */
    fnsku: paramText,
    /** Rail disposition pills (`hydrated` · `stubs`; `all` is the bare URL). */
    fbaFilter: paramEnum(['hydrated', 'stubs'] as const),
  },
  carries: SHIPPING_CARRIES,
});

/** `/shipping/shipped` — the Shipped desk: */
const SHIPPED_ROUTE_PARAMS = defineRouteParams({
  route: SHIPPING_SHIPPED_PATH,
  owns: {
    /** Find by order number / tracking / SKU. */
    search: paramText,
    /**
     * The open package (`SHIPMENT_RECORD_PARAM`): a `shipping_tracking_numbers.id`,
     * or `scan-<id>` for a pack scan that captured no tracking (no package record).
     */
    shipment: paramText,
    /** Legacy open order line — the ledger maps it to that line's package, then drops it. */
    openOrderId: paramPositiveInt,
    shippedFilter: paramEnum(['all', 'orders', 'sku', 'fba'] as const),
    shippedSearchField: paramRoundTrip(parseShippedSearchFieldWire),
    /** Week window (0 = current). The default paint, never "all time". */
    shippedWeekOffset: paramPositiveInt,
    /** Explicit day window — wins over the week in `resolveShippedQueryArgs`. */
    dateFrom: paramDateKey,
    dateTo: paramDateKey,
    /** Intentional "no date window" (Packed's dismissable seed). */
    allDates: paramFlag,
    /** Outbound-state facet off the status legend (e.g. `PACKED_STAGED`). */
    ostatus: paramText,
    exceptions: paramFlag,
    carrier: paramText,
    statusCategory: paramText,
    packedBy: paramPositiveInt,
    /** Who ACTUALLY picked the shipped order (pick facts). */
    pickedBy: paramPositiveInt,
    /** Time of day at each end of the dateFrom/dateTo window (HH:mm, PT). */
    timeFrom: paramTimeKey,
    timeTo: paramTimeKey,
    /** Grid display sort — column/server ids, same alphabet as the desk. */
    sort: paramText,
    dir: paramEnum(['asc', 'desc'] as const),
    ...DESK_LOCATE_PARAMS,
  },
  carries: SHIPPING_CARRIES,
});

/**
 * `/shipping/exceptions` — the held-order queue, on the outbound grid.
 * (operator ruling 2026-08-31 — `all` redefines the queue into a
 * Search is desk-local (`useDeskSearch`), never a URL param.
 */
const EXCEPTIONS_ROUTE_PARAMS = defineRouteParams({
  route: SHIPPING_EXCEPTIONS_PATH,
  owns: {
    /** The open record. Present ⇒ the editor page; absent ⇒ the table. */
    order: paramPositiveInt,
    /** Category facet — the exact `ORDER_EXCEPTION_CATEGORIES` label (`SKU Mapping`, …). */
    category: paramRoundTrip((raw) =>
      (ORDER_EXCEPTION_CATEGORIES as readonly string[]).includes(raw) ? raw : null,
    ),
    ...DESK_LOCATE_PARAMS,
  },
  carries: SHIPPING_CARRIES,
});

/**
 * `/shipping/shortage` — the Picking desk: the To-ship table locked to BLOCKED
 * (`lockedFulfillmentState`), narrowed server-side by the PO-pair lens. Search
 * is desk-local (`useDeskSearch`), never a URL param.
 */
const SHORTAGE_ROUTE_PARAMS = defineRouteParams({
  route: SHIPPING_SHORTAGE_PATH,
  owns: {
    /** PO-paired lens; the page redirects any other value to `po`. */
    [DESK_PAIR_PARAM]: paramEnum(['po'] as const),
    /** The open record (`useDashboardSelectedOrder`). */
    openOrderId: paramPositiveInt,
    /** Queue display sort (`useQueueDisplaySort` via the ledger feed). */
    sort: paramText,
    dir: paramEnum(['asc', 'desc'] as const),
    /** The To-ship filter menu the table mounts here too. */
    ...TO_SHIP_QUEUE_FACET_PARAMS,
    /** Packing DESK/STAGING placement filter, read by the same table. */
    packStation: paramPositiveInt,
    packPlaced: paramFlag,
    ...DESK_LOCATE_PARAMS,
    ...QUEUE_TRIAGE_PARAMS,
  },
  carries: SHIPPING_CARRIES,
});

/** `/shipping/scan-out` — dock ship-confirm over the staged queue. */
const SCAN_OUT_ROUTE_PARAMS = defineRouteParams({
  route: OUTBOUND_MODE_PATHS['scan-out'],
  owns: {
    ...SHIPPING_COMMON,
    open: paramPositiveInt,
  },
  carries: SHIPPING_CARRIES,
});

/** Sidebar mode id → the spec for the route that mode lands on. */
export const OUTBOUND_MODE_ROUTE_PARAMS = {
  fba: FBA_ROUTE_PARAMS,
  'scan-out': SCAN_OUT_ROUTE_PARAMS,
} as const satisfies Record<OutboundMode, RouteParamsSpec>;

/** Every shipping route spec. Resolution order is the registry's job. */
export const OUTBOUND_ROUTE_PARAMS: readonly RouteParamsSpec[] = [
  ORDERS_ROUTE_PARAMS,
  EXCEPTIONS_ROUTE_PARAMS,
  SHORTAGE_ROUTE_PARAMS,
  FBA_ROUTE_PARAMS,
  SHIPPED_ROUTE_PARAMS,
  SCAN_OUT_ROUTE_PARAMS,
];
