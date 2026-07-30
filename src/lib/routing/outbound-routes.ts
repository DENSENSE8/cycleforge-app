/**
 * Param ownership for the four Shipping (Outbound) mode routes.
 *
 * Slice 3 of the nav/routing refactor: the mode moved from `?mode=` onto the
 * path (`/shipping/labels|ready|fba|scan-out`), and each of those routes now
 * declares what it owns. `OUTBOUND_MODE_SCOPED_PARAMS` — the fifth denylist —
 * exists only because a mode switch used to copy the whole query string and
 * then delete sixteen remembered keys.
 *
 * The segments are NOT what isolates these params; the boundary parse is. See
 * `@/lib/routing/route-params`.
 */

import {
  OUTBOUND_MODE_PATHS,
  type OutboundMode,
} from '@/components/outbound/outbound-sidebar-shared';
import {
  defineRouteParams,
  paramEnum,
  paramFlag,
  paramPositiveInt,
  paramText,
  type RouteParamsSpec,
} from './route-params';

/** Every shipping mode reads the same operator-level bits. */
const SHIPPING_CARRIES = ['staff', 'staffId', 'colsort', 'coldir', 'pane', 'layout', 'density', 'weekOffset'] as const;

/** Search box + display sort are the same question on all four modes. */
const SHIPPING_COMMON = {
  q: paramText,
  sort: paramEnum(['priority', 'newest'] as const),
} as const;

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
    ltab: paramText,
    rtab: paramText,
  },
  carries: SHIPPING_CARRIES,
});

/** `/shipping/ready` — the allocation table. */
const READY_ROUTE_PARAMS = defineRouteParams({
  route: OUTBOUND_MODE_PATHS.ready,
  owns: {
    ...SHIPPING_COMMON,
    open: paramPositiveInt,
    /** Attention-only filter over the ready queue. */
    attention: paramFlag,
    ustatus: paramText,
    ostatus: paramText,
  },
  carries: SHIPPING_CARRIES,
});

/** `/shipping/fba` — the FBA board (plan / combine / shipped rails). */
const FBA_ROUTE_PARAMS = defineRouteParams({
  route: OUTBOUND_MODE_PATHS.fba,
  owns: {
    ...SHIPPING_COMMON,
    /** Board sub-mode. */
    fbaMode: paramText,
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
  ready: READY_ROUTE_PARAMS,
  fba: FBA_ROUTE_PARAMS,
  'scan-out': SCAN_OUT_ROUTE_PARAMS,
} as const satisfies Record<OutboundMode, RouteParamsSpec>;

/** Every shipping route spec. Resolution order is the registry's job. */
export const OUTBOUND_ROUTE_PARAMS: readonly RouteParamsSpec[] = [
  LABELS_ROUTE_PARAMS,
  READY_ROUTE_PARAMS,
  FBA_ROUTE_PARAMS,
  SCAN_OUT_ROUTE_PARAMS,
];
