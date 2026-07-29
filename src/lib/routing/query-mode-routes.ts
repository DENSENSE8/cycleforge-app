/**
 * Param ownership for the surfaces that still switch mode via `?mode=`.
 *
 * These routes have NOT moved to segments, and they do not need to in order to
 * be isolated — Slice 1's whole point. A spec here is enough: `applyModeTarget`
 * constructs the destination for any route it can resolve a spec for, so the
 * mode delta is all that survives a switch and the per-surface "clear these
 * fifteen keys" literals become dead weight.
 *
 * `mode` is an OWNED param on these routes, unlike on a migrated family where
 * being on the path is the mode. That asymmetry is the migration state showing
 * through, and it disappears when the surface graduates.
 */

import {
  defineRouteParams,
  paramDateKey,
  paramEnum,
  paramFlag,
  paramPositiveInt,
  paramText,
  type RouteParamsSpec,
} from './route-params';

/** Operator-level bits every workbench accepts on arrival. */
const WORKBENCH_CARRIES = ['staff', 'staffId', 'colsort', 'coldir'] as const;

/**
 * `/support` — Tickets · Orders · Voicemail · Calls · Warranty · Issues.
 *
 * Replaces `SUPPORT_MODE_CLEAR_PARAMS`, a 20-key null-map spread into all six
 * mode targets so that each mode "opens clean". Constructing the target URL
 * makes opening clean the default rather than a thing each target re-states.
 */
const SUPPORT_ROUTE_PARAMS = defineRouteParams({
  route: '/support',
  owns: {
    mode: paramEnum(['orders', 'voicemail', 'calls', 'warranty', 'issues'] as const),
    /** Focused record, per mode. */
    ticket: paramText,
    vm: paramText,
    issueId: paramPositiveInt,
    open: paramPositiveInt,
    openOrderId: paramPositiveInt,
    /** Filters. */
    q: paramText,
    search: paramText,
    status: paramText,
    assignee: paramText,
    direction: paramText,
    range: paramText,
    type: paramText,
    reporter: paramText,
    stage: paramText,
    /** Warranty-scoped. */
    wstatus: paramText,
    wexp: paramText,
    /** Ready/units-scoped. */
    ustatus: paramText,
    attention: paramFlag,
    /** Tickets board — its own search + status, namespaced away from `q`/`status`. */
    tq: paramText,
    tstatus: paramText,
    /** Opens the create-ticket form over the orders workspace. */
    createTicket: paramText,
  },
  carries: WORKBENCH_CARRIES,
});

/**
 * `/dashboard` — Search · Receiving · Outbound.
 *
 * Each mode target used to null out a dozen sibling keys inline so a Search
 * handoff never bled into Receiving/Shipping. Constructing does that by
 * omission.
 */
const DASHBOARD_ROUTE_PARAMS = defineRouteParams({
  route: '/dashboard',
  owns: {
    mode: paramEnum(['search', 'receiving', 'inbound', 'outbound'] as const),
    /** Search-scoped handoff — the trio that must never reach another mode. */
    q: paramText,
    map: paramText,
    openOrderId: paramPositiveInt,
    /** Outbound lifecycle tabs. */
    unshipped: paramText,
    pending: paramText,
    shipped: paramText,
    fba: paramText,
    warranty: paramText,
    /** Grid + inspector state. */
    open: paramPositiveInt,
    sort: paramText,
    rtab: paramText,
    type: paramText,
    dq: paramText,
  },
  carries: WORKBENCH_CARRIES,
});


/**
 * `/` (Home) — Today · Inbox · Tasks · Collab · Forge · Brief.
 *
 * Replaces `HOME_MODE_SCOPED_PARAMS`.
 */
const HOME_ROUTE_PARAMS = defineRouteParams({
  route: '/',
  owns: {
    mode: paramEnum(['inbox', 'tasks', 'collab', 'forge', 'brief'] as const),
    task: paramText,
    plan: paramText,
    view: paramText,
    q: paramText,
    open: paramPositiveInt,
    scope: paramText,
    filter: paramText,
  },
  carries: WORKBENCH_CARRIES,
});

/**
 * `/operations` — Live · Analytics · Insights · History · Signals · Plans.
 *
 * Replaces `OPERATIONS_MODE_SCOPED_PARAMS`, the largest of the denylists at 26
 * keys: six modes' worth of filters, the Master Operations Journey's focus set,
 * and the Signals timeline, all listed in one array so that switching mode could
 * delete them one by one.
 */
const OPERATIONS_ROUTE_PARAMS = defineRouteParams({
  route: '/operations',
  owns: {
    mode: paramEnum(['analytics', 'insights', 'history', 'signals', 'plans'] as const),
    /** Shared filter band. */
    q: paramText,
    open: paramPositiveInt,
    view: paramText,
    status: paramText,
    cursor: paramText,
    /** Analytics. */
    section: paramText,
    range: paramText,
    segment: paramText,
    /** History station filters. (The actor filter rides the ambient `staffId`.) */
    station: paramText,
    stations: paramText,
    types: paramText,
    sources: paramText,
    from: paramDateKey,
    until: paramDateKey,
    /** Master Operations Journey focus. */
    dim: paramEnum(['order', 'serial', 'tracking', 'unit'] as const),
    order: paramText,
    serial: paramText,
    tracking: paramText,
    unit: paramPositiveInt,
    /** Signals. */
    signalsView: paramEnum(['timeline', 'browse'] as const),
    signalId: paramText,
    window: paramText,
    signalKind: paramText,
  },
  carries: WORKBENCH_CARRIES,
});

/** Every still-query-mode surface with a declared spec. */
export const QUERY_MODE_ROUTE_PARAMS: readonly RouteParamsSpec[] = [
  SUPPORT_ROUTE_PARAMS,
  DASHBOARD_ROUTE_PARAMS,
  OPERATIONS_ROUTE_PARAMS,
  // `/` is the shortest prefix in the registry, so it must never shadow another
  // route — the registry sorts longest-first, which keeps it last in practice.
  HOME_ROUTE_PARAMS,
];
