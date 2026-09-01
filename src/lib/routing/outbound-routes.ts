/**
 * Param ownership for the Shipping (Outbound) mode routes.
 *
 * Slice 3 of the nav/routing refactor: the mode moved from `?mode=` onto the
 * path (`/shipping/fba|scan-out`), and each of those routes now
 * declares what it owns. Ready lives as `?fbaMode=ready` on `/shipping/fba`
 * (not its own path). To-ship desk lives at `/shipping/orders` (former
 * `/dashboard` outbound board).
 *
 * The segments are NOT what isolates these params; the boundary parse is. See
 * `@/lib/routing/route-params`.
 */

import {
  OUTBOUND_MODE_PATHS,
  type OutboundMode,
} from '@/components/outbound/outbound-sidebar-shared';
import { parseFbaModeWire } from '@/lib/fba/fba-modes';
import { SHIPPING_EXCEPTIONS_PATH, SHIPPING_ORDERS_PATH } from '@/lib/shipping/orders-desk';
import { SHIPPING_SHIPPED_PATH } from '@/lib/shipping/shipped-desk';
import { parseShippedSearchFieldWire } from '@/lib/shipped-search';
import { parseReadyWorkspaceTabWire } from '@/utils/ready-workspace-state';
import {
  defineRouteParams,
  paramDateKey,
  paramEnum,
  paramFlag,
  paramPositiveInt,
  paramPresence,
  paramRoundTrip,
  paramText,
  type RouteParamsSpec,
} from './route-params';

/** Every shipping mode reads the same operator-level bits. */
const SHIPPING_CARRIES = ['staff', 'staffId', 'colsort', 'coldir', 'pane', 'layout', 'weekOffset'] as const;

/** Search box + display sort are the same question on all shipping modes. */
const SHIPPING_COMMON = {
  q: paramText,
  sort: paramEnum(['priority', 'newest'] as const),
} as const;

/**
 * `/shipping/orders` — To-ship desk (Pending · Tested · Packed · Shipped).
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
    type: paramText,
    search: paramText,
    attention: paramFlag,
    ustatus: paramText,
    stage: paramText,
    late: paramFlag,
    /** Packing DESK/STAGING placement filter (Ready-to-Pack → To-ship). */
    packStation: paramPositiveInt,
    packPlaced: paramFlag,
    new: paramEnum(['true'] as const),
    /**
     * Add-orders rail, opened on the method list rather than hand entry.
     * MUST stay declared: `useSurfaceParamHygiene` (mounted in the shipping
     * layout) re-parses the URL against this spec on every param change and
     * drops anything undeclared. While `ingest` was missing here, the chrome
     * Add wrote `?ingest=true` and the hygiene pass stripped it on the next
     * tick — the rail opened and closed itself before the operator could type.
     */
    ingest: paramEnum(['true'] as const),
    /**
     * Caged → released intake session (`OrderIntakeOverlay`, centered).
     * `new` starts an order; a numeric id re-opens that caged order's
     * session. Declared for the same reason `ingest` is — an undeclared param
     * on this route is stripped on the operator's next keystroke.
     */
    triage: paramText,
    /**
     * To-ship Labels walk (`PaperworkWalkHost`). MUST stay declared:
     * `useSurfaceParamHygiene` in the shipping layout drops undeclared keys
     * on the next tick. While this was missing, Labels wrote `?paperwork=`
     * and hygiene stripped it — the desk flashed table ↔ walk.
     */
    paperwork: paramPositiveInt,
    /** Caged facet on the To-ship queue — shows the held set instead of the live one. */
    cage: paramFlag,
    /** CSV import staging surface on the To-Ship desk (session draft in memory). */
    import: paramEnum(['csv'] as const),
    shippedFilter: paramEnum(['all', 'orders', 'sku', 'fba'] as const),
    shippedSearchField: paramRoundTrip(parseShippedSearchFieldWire),
    shippedWeekOffset: paramPositiveInt,
    ostatus: paramText,
    exceptions: paramFlag,
    carrier: paramText,
    statusCategory: paramText,
    packedBy: paramPositiveInt,
    testedBy: paramPositiveInt,
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

/*
 * `/shipping/labels` — DELETED 2026-08-30 along with its route. Its params
 * (`ltab`, `open`, `new`, `rtab`, `q`, `sort`) died with the surface that owned
 * them; a spec for a route that does not exist would be a boundary parse for
 * nothing, and `routeParamsFor('/shipping/labels')` now correctly finds none.
 */
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
  },
  carries: SHIPPING_CARRIES,
});

/**
 * `/shipping/shipped` — the Shipped desk: shipment history + lookup.
 *
 * Owns the whole existing shipped vocabulary, unchanged, because that is what
 * makes the promotion a MOVE rather than a rewrite: `resolveShippedQueryArgs`
 * is still the only resolver, and a `?carrier=UPS&shippedWeekOffset=2` bookmark
 * that used to hang off the orders desk reads identically here.
 *
 * The open-queue keys are deliberately absent. `stage`, `cage`, `ustatus`,
 * `late` and `attention` are questions about work still in the warehouse; on an
 * archive they would be filters that can only ever return nothing, and the
 * boundary parse dropping them is what stops a forwarded To-ship URL from
 * landing here wearing a queue's refinements.
 */
const SHIPPED_ROUTE_PARAMS = defineRouteParams({
  route: SHIPPING_SHIPPED_PATH,
  owns: {
    /** Find by order number / tracking / SKU. */
    search: paramText,
    /** Open row — the details panel's deep-link, same key as the To-ship desk. */
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
    testedBy: paramPositiveInt,
    /** Grid display sort — column/server ids, same alphabet as the desk. */
    sort: paramText,
    dir: paramEnum(['asc', 'desc'] as const),
  },
  carries: SHIPPING_CARRIES,
});

/**
 * `/shipping/exceptions` — the held-order queue, on the outbound grid.
 *
 * It needs a spec because `useSurfaceParamHygiene` is mounted in the shipping
 * LAYOUT, so this route is inside the boundary parse whether or not it declares
 * anything. Without one it falls through to `stripCrossSurfaceParams`, which is
 * a DENYLIST — it happens to keep `?order=` today only because this path is not
 * a testing surface, which is luck rather than a contract. This desk has
 * already paid twice for a param the hygiene pass dropped on the operator's
 * next keystroke (`ingest`, `triage`).
 *
 * `order` is the link an operator sends a colleague ("this one is wrong,
 * look"), and it is also the surface's own record/queue switch, so it is the
 * one param here that must survive a paste.
 *
 * There is deliberately NO `scope`: the queue is fixed to `actionable`
 * (operator ruling 2026-08-31 — `all` redefines the queue into a
 * several-thousand-row backlog sweep rather than narrowing it, so it would be a
 * mode, not a filter). Column sort rides `colsort`/`coldir` through
 * {@link SHIPPING_CARRIES}, which is why neither is named here.
 */
const EXCEPTIONS_ROUTE_PARAMS = defineRouteParams({
  route: SHIPPING_EXCEPTIONS_PATH,
  owns: {
    /** The open record. Present ⇒ the editor page; absent ⇒ the table. */
    order: paramPositiveInt,
    /** Find row (order # / item # / SKU / title). */
    search: paramText,
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
  FBA_ROUTE_PARAMS,
  SHIPPED_ROUTE_PARAMS,
  SCAN_OUT_ROUTE_PARAMS,
];
