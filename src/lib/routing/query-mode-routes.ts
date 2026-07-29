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

import { parseLabelsView } from '@/components/labels/labels-view';
import {
  parseCatalogPlatform,
  parseLinkFilter,
} from '@/components/products/catalog/catalog-url-state';
import { PAIRING_SORTS } from '@/components/products/pairing/types';
import { parseProductsView } from '@/components/products/products-view';
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
    /**
     * Outbound lifecycle tabs — BARE presence flags (`?shipped`), selected by
     * `.has()` in `utils/dashboard-search-state.ts`, never by value.
     *
     * These were `paramText` until 2026-07-29, which rejects the empty value a
     * valueless key carries, so every one of them was dropped by the boundary
     * parse: `?shipped` parsed to `""` and the tab fell back to Unshipped. It
     * did not bite yet only because `/dashboard` does not mount
     * `useSurfaceParamHygiene()` — adding that hook is a step of the migration
     * method, so the trap was armed and waiting for it.
     */
    unshipped: paramPresence,
    pending: paramPresence,
    packed: paramPresence,
    tested: paramPresence,
    shipped: paramPresence,
    fba: paramPresence,
    warranty: paramPresence,
    /** Grid + inspector state. */
    open: paramPositiveInt,
    sort: paramText,
    rtab: paramText,
    type: paramText,
    dq: paramText,
    /** Packed-tab search box (`searchScopeHref('ORDER')` lands here). */
    search: paramText,
    /** Outbound filter strip. */
    attention: paramFlag,
    ustatus: paramText,
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

/**
 * `/products` — Catalog · Manuals · Labels · Pairing · QC · Kit Parts.
 *
 * Never had a denylist, and that is exactly why it leaked: `handleViewChange`
 * copied the whole query string and flipped one key, so a QC selection
 * (`?skuId=`), a Pairing sort and a Labels history row all rode into Catalog. It
 * is the same defect the nine deleted denylists were written to paper over —
 * this surface just never got the paper.
 *
 * Every vocabulary here composes its existing parser rather than re-listing the
 * values, so a new view / platform / sub-tab cannot drift the spec.
 */
export const PRODUCTS_ROUTE_PARAMS = defineRouteParams({
  route: '/products',
  owns: {
    view: paramRoundTrip(parseProductsView),
    /** Sidebar filter box — the same "narrow this list" question everywhere. */
    q: paramText,
    /** Pairing backlog ordering. */
    sort: paramEnum(PAIRING_SORTS),
    /** Selected catalog row — QC and Kit Parts address the same id space. */
    skuId: paramPositiveInt,
    /** Selected SKU on Pairing (the SKU string, not the catalog id). */
    sku: paramText,
    /** Catalog chrome: platform tab + the refine popover's segment and flags. */
    platform: paramRoundTrip(parseCatalogPlatform),
    linkFilter: paramRoundTrip(parseLinkFilter),
    pending: paramFlag,
    inactive: paramFlag,
    noChannels: paramFlag,
    noManuals: paramFlag,
    noQc: paramFlag,
    /** Labels sub-tab (Products · Recent · History) and its focused unit. */
    labelsView: paramRoundTrip(parseLabelsView),
    historyId: paramText,
  },
  carries: WORKBENCH_CARRIES,
});

/**
 * `/search` — the cross-entity results surface Phase 1 of the dashboard IA
 * rework evicted out of `?mode=search`.
 *
 * `?q=` is the whole state today. A spec still earns its keep before that
 * changes: the route is where a search hit hands off, so it is a natural
 * landing pad for another surface's params, and the results grid (IA plan
 * Phase 6) will want sort/scope keys that must not silently collide with
 * `/support`'s `status`/`range`/`type` or `/dashboard`'s `sort`/`open`.
 * Declaring it now means the collision is a build failure rather than a
 * filter that quietly does nothing.
 */
const SEARCH_ROUTE_PARAMS = defineRouteParams({
  route: '/search',
  owns: {
    /** The query. Typing happens in the global header pill; this is the state. */
    q: paramText,
  },
  carries: ['staff', 'colsort', 'coldir'],
});

/** Every still-query-mode surface with a declared spec. */
export const QUERY_MODE_ROUTE_PARAMS: readonly RouteParamsSpec[] = [
  SUPPORT_ROUTE_PARAMS,
  DASHBOARD_ROUTE_PARAMS,
  OPERATIONS_ROUTE_PARAMS,
  PRODUCTS_ROUTE_PARAMS,
  SEARCH_ROUTE_PARAMS,
  // `/` is the shortest prefix in the registry, so it must never shadow another
  // route — the registry sorts longest-first, which keeps it last in practice.
  HOME_ROUTE_PARAMS,
];
