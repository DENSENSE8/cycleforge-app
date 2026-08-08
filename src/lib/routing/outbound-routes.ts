/**
 * Param ownership for the Shipping (Outbound) mode routes.
 *
 * Slice 3 of the nav/routing refactor: the mode moved from `?mode=` onto the
 * path (`/shipping/labels|fba|scan-out`), and each of those routes now
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
import { SHIPPING_ORDERS_PATH } from '@/lib/shipping/orders-desk';
import { parseShippedSearchFieldWire } from '@/lib/shipped-search';
import { parseLabelsWorkspaceTabWire } from '@/utils/labels-workspace-state';
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
const SHIPPING_CARRIES = ['staff', 'staffId', 'colsort', 'coldir', 'pane', 'layout', 'density', 'weekOffset'] as const;

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
    new: paramEnum(['true'] as const),
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

/** `/shipping/labels` — the Queue/Recent workbench and the label flow. */
const LABELS_ROUTE_PARAMS = defineRouteParams({
  route: OUTBOUND_MODE_PATHS.labels,
  owns: {
    ...SHIPPING_COMMON,
    /** Focused order — opens the label / packing-slip workspace over the queue. */
    open: paramPositiveInt,
    /** New-order intake slide-over. */
    new: paramEnum(['true'] as const),
    /** Queue vs Recent tab. */
    ltab: paramRoundTrip(parseLabelsWorkspaceTabWire),
    rtab: paramText,
  },
  carries: SHIPPING_CARRIES,
});

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
  labels: LABELS_ROUTE_PARAMS,
  fba: FBA_ROUTE_PARAMS,
  'scan-out': SCAN_OUT_ROUTE_PARAMS,
} as const satisfies Record<OutboundMode, RouteParamsSpec>;

/** Every shipping route spec. Resolution order is the registry's job. */
export const OUTBOUND_ROUTE_PARAMS: readonly RouteParamsSpec[] = [
  ORDERS_ROUTE_PARAMS,
  LABELS_ROUTE_PARAMS,
  FBA_ROUTE_PARAMS,
  SCAN_OUT_ROUTE_PARAMS,
];
