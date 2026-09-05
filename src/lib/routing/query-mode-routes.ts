/**
 * Param ownership for the surfaces that still switch mode via `?mode=`.
 *
 * These routes have NOT moved to segments, and they do not need to in order to
 * be isolated — Slice 1's whole point. A spec here is enough: `applyChildTarget`
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
  parseSourcingAnalyticsRange,
  parseSourcingModeWire,
} from '@/components/sourcing/sourcing-shared';
import { parseSupportModeWire } from '@/components/sidebar/support/support-sidebar-shared';
import { parseOperationsModeWire } from '@/components/sidebar/operations/operations-sidebar-shared';
import { parseForgeViewWire } from '@/components/forge/forge-view';
import { parseHomeModeWire } from '@/features/home/home-modes';
import { parseReviewModeWire } from '@/features/review/review-mode';
import { parseDashboardModeWire } from '@/lib/dashboard/dashboard-domains';
import { parseLocationsTabWire } from '@/lib/inventory/locations-path';
import {
  RECEIVING_HISTORY_URL_PARAMS,
  parseReceivingHistorySearchFieldWire,
  parseReceivingHistorySearchScopeWire,
} from '@/lib/receiving-history-search';
import { isRepairColumnSort } from '@/lib/repair/repair-display-sort';
import {
  parseSearchEtypeWire,
  parseSearchScopeWire,
} from '@/lib/search/search-refine';
import {
  parsePickupTab,
  parseRepairTab,
  parseSalesTab,
  parseWalkInHistoryModeWire,
} from '@/lib/walk-in/history-modes';
import { parseReviewPackingTab } from '@/lib/packing/review-packing-tabs';
import { parsePackScanModeWire, parsePackWorkspaceTab } from '@/utils/pack-workspace-state';
import { parseShippingWorkspaceTab } from '@/utils/shipping-workspace-state';
import { parseTestingWorkspaceTab } from '@/utils/testing-workspace-state';
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
const WORKBENCH_CARRIES = ['staff', 'staffId', 'colsort', 'coldir', 'pane', 'layout', 'weekOffset'] as const;

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
    /**
     * Mode on the WIRE — includes default `tickets` (usually omitted, but
     * deep links like VoicemailDetail still write it). Never a hand-copied
     * enum that forgets the default token.
     */
    mode: paramRoundTrip(parseSupportModeWire),
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
    /**
     * Domain axis: `sales` / `pickup` / `repairs` (front-desk history) · legacy
     * `inbound` / `receiving` / `search` / `outbound` (redirected). Bare outbound
     * 308s to `/shipping/orders`; inbound → `/incoming?lane=docked`.
     * Round-trip {@link parseDashboardModeWire} — never a hand-copied twin.
     */
    mode: paramRoundTrip(parseDashboardModeWire),
    /**
     * Sales-domain history tabs (`WalkInHistoryHub`) — Pickup Draft/Completed,
     * Sales Today/All, Repairs Active/Done. Same round-trip as `/walk-in` so a
     * redirected bookmark keeps its tab after `retiredWalkInHistoryTarget`.
     */
    tab: paramRoundTrip((raw) =>
      parsePickupTab(raw) === raw || parseSalesTab(raw) === raw || parseRepairTab(raw) === raw
        ? raw
        : null,
    ),
    /** Search-scoped handoff — the trio that must never reach another mode. */
    q: paramText,
    map: paramText,
    openOrderId: paramPositiveInt,
    /**
     * HAND-OFF keys — read on this route only to be forwarded, never rendered.
     * Outbound lifecycle tabs moved to `/shipping/orders`; these remain so
     * retired front-door redirects (`?warranty=`, `?fba`) still see what the
     * bookmark asked for before client-redirecting to Support / FBA.
     */
    warranty: paramPresence,
    fba: paramPresence,
    /** Support warranty deep-link: open claim id. */
    open: paramText,
    wstatus: paramText,
    wexp: paramText,
    /**
     * Shared search key — Support warranty filter, and RepairTable queue search
     * when `mode=repairs` (same param name as `/repair`).
     */
    search: paramText,
    /** RepairTable display sort on Sales → Repairs (`?mode=repairs`). */
    sort: paramRoundTrip((raw) => (raw === 'newest' || isRepairColumnSort(raw) ? raw : null)),
    dir: paramEnum(['asc', 'desc'] as const),
    /** RepairTable deep-link (Sales history may open a row; intake stays on `/repair`). */
    openRepair: paramPositiveInt,
    dq: paramText,
    /**
     * Legacy inbound domain params — kept so `/dashboard?mode=inbound` bookmarks
     * survive SurfaceParamHygiene until the proxy 308 to `/incoming?lane=docked`.
     */
    [RECEIVING_HISTORY_URL_PARAMS.q]: paramText,
    [RECEIVING_HISTORY_URL_PARAMS.field]: paramRoundTrip(parseReceivingHistorySearchFieldWire),
    [RECEIVING_HISTORY_URL_PARAMS.scope]: paramRoundTrip(parseReceivingHistorySearchScopeWire),
  },
  carries: WORKBENCH_CARRIES,
});


/**
 * `/` (Home) — Daily · Today.
 *
 * Replaces `HOME_MODE_SCOPED_PARAMS`.
 *
 * Shrank on 2026-08-19 with the mode list: `plan`, `view` and `ticket` belonged
 * to the deleted Tasks mode and to forge, which moved to `/forge` and took its
 * two params with it (see {@link FORGE_ROUTE_PARAMS}).
 */
const HOME_ROUTE_PARAMS = defineRouteParams({
  route: '/',
  owns: {
    mode: paramRoundTrip(parseHomeModeWire),
    /**
     * Daily's civil day (`YYYY-MM-DD`) — the day stepper's durable state, which
     * is what makes a past report linkable to a colleague. Undeclared until
     * 2026-08-19, so a mode switch through `buildRouteUrl` silently dropped it
     * (unknown keys are dropped at the boundary — that is the whole contract).
     */
    date: paramDateKey,
    /**
     * Daily checklist inspector (`HomeDailyMode`). The selected check id, so
     * a refresh reopens the same right-rail occupant.
     */
    item: paramPositiveInt,
    task: paramText,
    q: paramText,
    open: paramPositiveInt,
    scope: paramText,
    filter: paramText,
    /** Today's per-staffer lens (`useMyDayView`). Undeclared until 2026-08-19. */
    staff: paramPositiveInt,
    /** Today Watch rail — ticket or tracking intake (`?watch=1`). */
    watch: paramFlag,
  },
  carries: WORKBENCH_CARRIES,
});

/**
 * `/forge` — Plans Live (master-plan MDX + TicketStatus + plan agent).
 *
 * Its own spec since 2026-08-19: the console moved off Home's `?mode=forge`
 * onto a real route, and a param vocabulary belongs to the route that owns it.
 */
const FORGE_ROUTE_PARAMS = defineRouteParams({
  route: '/forge',
  owns: {
    /** Forge Plans Live: `live`|`agent` (agent-primary) · `doc` (MDX-primary). */
    view: paramRoundTrip(parseForgeViewWire),
    /** Selected master-plan `<TicketStatus ticketId>`. */
    ticket: paramText,
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
    mode: paramRoundTrip(parseOperationsModeWire),
    /** Checks mode civil day. */
    date: paramDateKey,
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
    /**
     * Selected manual on the Manuals view — `product_manuals.id`.
     *
     * Undeclared until 2026-08-01, which broke manual selection outright:
     * `useManualNavigation` writes `?id=`, then `SurfaceParamHygiene` rebuilt
     * the query string from `declaredKeys(spec)` alone and dropped it, so the
     * detail pane snapped straight back to empty. The fork at
     * `/manuals/library` appeared to work only because it mounts no hygiene.
     */
    id: paramPositiveInt,
  },
  carries: WORKBENCH_CARRIES,
});

/**
 * `/sourcing` — Queue · Scout · Watchlist · Searches · Suppliers · Analytics.
 *
 * Had a clear list in two places and both were incomplete, which is the whole
 * argument for constructing. `SourcingSidebarPanel.goMode` deleted `q`, `status`
 * and `type`; the nav targets in `sidebar-navigation.ts` deleted `mode`, `q` and
 * `status`. Neither deleted `by` or `range`, so Scout's search-field toggle
 * (`?by=serial`) and the Analytics window (`?range=1y`) rode into every sibling
 * mode — two lists to keep in sync, both missing the same two keys.
 */
export const SOURCING_ROUTE_PARAMS = defineRouteParams({
  route: '/sourcing',
  owns: {
    /**
     * Queue is the default (usually omitted). `lookup` / `alerts` are legacy
     * spellings {@link resolveSourcingMode} still aliases. Round-trip
     * {@link parseSourcingModeWire} so `queue` + aliases survive hygiene.
     */
    mode: paramRoundTrip(parseSourcingModeWire),
    /** Sidebar filter box — Scout's model/serial query and Suppliers' name filter. */
    q: paramText,
    /** Which field Scout's query searches. The key no clear list remembered. */
    by: paramEnum(['model', 'serial'] as const),
    /** Queue + Watchlist status facet. */
    status: paramText,
    /** Suppliers type facet (`ebay_seller` · `distributor` · `salvage` · `oem` · …). */
    type: paramText,
    /** Analytics window — composes the existing parser rather than re-listing it. */
    range: paramRoundTrip(parseSourcingAnalyticsRange),
  },
  carries: WORKBENCH_CARRIES,
});

/**
 * `/test` — the Testing station's Workbench half (Shipping | Testing).
 *
 * The route is `/test`; `/tech` is a legacy alias the proxy redirects, so it
 * deliberately gets no spec of its own — a second spec would double-own `ship`
 * and `testTab` and force two new `SHARED_OWNED_KEYS` entries for a route that
 * only exists to redirect.
 *
 * **`ship` and `testTab` are why this surface needed a careful enumeration.**
 * Both are read through a CONSTANT (`searchParams.get(SHIPPING_WORKSPACE_TAB_PARAM)`)
 * from a module outside every surface tree (`@/utils/*-workspace-state`), so the
 * `.get('literal')` grep in the migration method finds neither — and neither does
 * the ownership guard, whose regex also only matches literals. They were found by
 * reading `useTechRightView`'s docblock and then confirming it against the code.
 * Enumerate constant-keyed reads separately; see the method note in
 * `docs/todo/nav-routing-refactor-FINISH-PROMPT.md` §3.1.
 */
export const TEST_ROUTE_PARAMS = defineRouteParams({
  route: '/test',
  owns: {
    /**
     * Top-level pane. Absent = Shipping (the default), so it is not listed.
     * `testing-history` is a legacy spelling `useTechRightView` still folds into
     * `testing`; kept declared so an old link survives the boundary parse.
     */
    view: paramEnum(['testing', 'testing-history', 'receiving'] as const),
    /** Workspace search box (Testing history + the KPI strip both read it). */
    search: paramText,
    /** Shipping-mode workspace tab — composes the tab SoT, never a re-typed list. */
    ship: paramRoundTrip(parseShippingWorkspaceTab),
    /** Testing-mode workspace tab — same, from its own SoT. */
    testTab: paramRoundTrip(parseTestingWorkspaceTab),
    /** Armed packing DESK/STAGING filter (Ready-to-Pack placement). */
    packStation: paramPositiveInt,
    /** Any packing-station placement filter. */
    packPlaced: paramFlag,
    /**
     * Station composer destination — `unbox` (default, omitted) · `ticket` · `ask`.
     * Shared with Unbox / Arrival (`SHARED_OWNED_KEYS.composerMode`).
     */
    composerMode: paramEnum(['unbox', 'ticket', 'ask', 'label'] as const),
  },
  carries: WORKBENCH_CARRIES,
});

/**
 * `/walk-in` — retired Sales-history front door (redirects to
 * `/dashboard?mode=sales|pickup|repairs`). Spec kept so legacy deep-link keys
 * survive boundary parse until `useWalkInTaskRedirect` /
 * `retiredWalkInHistoryTarget` / proxy repair redirects consume them.
 *
 * The nav targets nulled `tab` and `category` by hand. `category` is NOT declared
 * here on purpose: it is a dead legacy key that only `proxy.ts`
 * (`resolveWalkInRepairModeRedirect`) still reads, server-side and before this
 * spec ever applies — browse → Sales `?mode=repairs`, task keys → `/repair` —
 * after which it deletes the key itself. Nothing on the client reads it, so
 * declaring it would preserve a param with no reader.
 */
export const WALK_IN_ROUTE_PARAMS = defineRouteParams({
  route: '/walk-in',
  owns: {
    /**
     * Pickup + repairs listed; Sales is the surface identity on the bare URL.
     * Proxy also accepts legacy singular `repair` before this spec applies.
     */
    mode: paramRoundTrip(parseWalkInHistoryModeWire),
    /**
     * Sub-tab, with a vocabulary **per mode** — Pickup (`draft`/`completed`),
     * Sales (`today`/`all`), Repairs (`incoming`/`active`/`done`). Accept the
     * union by round-tripping each existing parser rather than re-listing.
     */
    tab: paramRoundTrip((raw) =>
      parsePickupTab(raw) === raw || parseSalesTab(raw) === raw || parseRepairTab(raw) === raw
        ? raw
        : null,
    ),
    /**
     * Legacy task deep-links, read by `useWalkInTaskRedirect` / proxy and
     * forwarded to `/repair`. **They must be declared even though this page never
     * renders them** — the redirect reads them from the URL, so dropping them at
     * the boundary would silently turn a `?new=true` link into a plain history
     * page.
     */
    openRepair: paramPositiveInt,
    new: paramEnum(['true'] as const),
    search: paramText,
  },
  carries: WORKBENCH_CARRIES,
});

/**
 * `/inventory` — Ledger · Triage · Pulse · Graph · Replenish.
 *
 * One spec covers the sub-routes too (`/inventory/triage`, `/inventory/pulse`,
 * `/inventory/graph`): the registry prefix-matches, and all of them share
 * `useInventoryUrlState`, so they genuinely read one param set rather than four.
 *
 * Replaces the `{ mode, section, open }` null-map repeated across all five nav
 * targets — which, like every other clear list this refactor has opened, was
 * incomplete: it never nulled `sku`, `bin`, `unit`, `state`, `condition`, `q`,
 * `field` or `filter`, so a Ledger selection and its whole filter set rode into
 * Graph.
 *
 * Five of these keys are legitimately shared with a sibling route and are
 * declared in `SHARED_OWNED_KEYS`; each is the same question over a different
 * vocabulary, which is what that list exists for.
 *
 * `open` is `paramText`, NOT `paramPositiveInt` — `useInventoryUrlState` documents
 * it as a "pending detail-panel selection key" and reads it as an opaque string,
 * so the id-shaped schema every other route uses for `open` would drop it.
 */
export const INVENTORY_ROUTE_PARAMS = defineRouteParams({
  route: '/inventory',
  owns: {
    /** Legacy `?mode=` form; Triage/Pulse also have real routes. */
    mode: paramEnum(['ledger', 'triage', 'pulse', 'replenish'] as const),
    /** Only `replenish` is meaningful — it selects the Replenish mode. */
    section: paramEnum(['replenish'] as const),
    /** Sidebar search box + its tab-scoped field and bucket multi-select. */
    q: paramText,
    field: paramText,
    filter: paramText,
    /** Detail-panel selection key (opaque, see above). */
    open: paramText,
    /** The three legacy viewport selectors — one wins, in unit -> sku -> bin order. */
    sku: paramText,
    bin: paramText,
    unit: paramText,
    /** Comma-separated multi-selects read through `parseList`. */
    state: paramText,
    condition: paramText,
    /**
     * SKU-graph direction. `parents`/`children`/`tree` are `SkuGraphMode`; `parts`
     * is the fourth live value, read by `InventoryGraphRouter` to swap in the
     * parts view — it is absent from the type, so a round-trip on `SkuGraphMode`
     * would silently drop it.
     */
    view: paramEnum(['parents', 'children', 'tree', 'parts'] as const),
  },
  carries: WORKBENCH_CARRIES,
});

/**
 * `/inventory/locations` — Bin Tags · Racks · Rooms · Bins · Map (former `/warehouse` desk).
 *
 * Longer prefix than `/inventory`, so location facets (`tab`, map `view`, bin
 * filters) do not collide with Ledger/Graph ownership of `view` / `q` on the
 * parent inventory spec. Legacy `/warehouse` permanently redirects here.
 */
const INVENTORY_LOCATIONS_ROUTE_PARAMS = defineRouteParams({
  route: '/inventory/locations',
  owns: {
    /** Bin Tags is the default and rides the bare URL. */
    tab: paramRoundTrip(parseLocationsTabWire),
    room: paramText,
    code: paramText,
    q: paramText,
    status: paramText,
    showEmpty: paramFlag,
    /** Map color mode / floorplan switch — distinct from Inventory Graph `view`. */
    view: paramText,
    serial: paramText,
    new: paramEnum(['true'] as const),
    edit: paramFlag,
    /** Special-bin 2×1 print page (`/inventory/locations/print/special-bin`). */
    barcode: paramText,
  },
  carries: WORKBENCH_CARRIES,
});

/**
 * `/review` — Packing · Pairing · Catalog link (the Packer Review Station).
 *
 * Replaces the widest of the remaining clear lists: all three nav targets nulled
 * `rtab`, `packerLogId`, `orderId` and `choreId` inline, so each mode "opened
 * clean" only because someone had listed its siblings' keys four times.
 */
const REVIEW_ROUTE_PARAMS = defineRouteParams({
  route: '/review',
  owns: {
    /** Packing is the default and rides the bare URL, so only the other two. */
    mode: paramRoundTrip(parseReviewModeWire),
    /** Packing table tab — composes the tab SoT rather than re-listing it. */
    rtab: paramRoundTrip(parseReviewPackingTab),
    /** Focused record, one per mode; all three are `Number(...)`-parsed ids. */
    packerLogId: paramPositiveInt,
    orderId: paramPositiveInt,
    choreId: paramPositiveInt,
    /**
     * Catalog-link in-mode tab. Default (`catalog-link`) is omitted; only the
     * Missing item number section writes a value.
     */
    section: paramEnum(['missing-item-number'] as const),
    /** Focused `order_import_exceptions` row on the Missing item number tab. */
    exceptionId: paramPositiveInt,
    /** The table search box, shared by all three modes' tables. */
    search: paramText,
  },
  carries: WORKBENCH_CARRIES,
});

/**
 * `/pack` — the packing station workbench.
 *
 * The route is `/pack`; `/packer` is a legacy alias the proxy normalizes (same
 * shape as `/test` vs `/tech`), so it deliberately gets no spec of its own.
 *
 * `packview` is read through a CONSTANT (`PACK_WORKSPACE_TAB_PARAM`) from
 * `@/utils/pack-workspace-state`, outside every surface tree — the same blind
 * spot that hid `?ship=` / `?testTab=` on `/test`. It was excused in the
 * ownership guard's `UNDECLARED_PARAM_CONSTANTS` only because `/pack` had no
 * spec; declaring it here is what lets that entry go.
 */
const PACK_ROUTE_PARAMS = defineRouteParams({
  route: '/pack',
  owns: {
    /** Workbench tab — composes the tab SoT. */
    packview: paramRoundTrip(parsePackWorkspaceTab),
    /** Pack mode; `standard` is the default and is omitted from the URL. */
    packMode: paramRoundTrip(parsePackScanModeWire),
    /** Unit-status facet on the pack queue. */
    ustatus: paramText,
  },
  carries: WORKBENCH_CARRIES,
});

/**
 * `/warehouse` — orphan children only (`/warehouse/rma`, `/warehouse/replenishment`).
 * The main desk permanently redirects to `/inventory/locations`.
 *
 * Kept so those child routes still boundary-parse; the Locations desk owns the
 * same facet vocabulary under {@link INVENTORY_LOCATIONS_ROUTE_PARAMS}.
 */
export const WAREHOUSE_ROUTE_PARAMS = defineRouteParams({
  route: '/warehouse',
  owns: {
    tab: paramRoundTrip(parseLocationsTabWire),
    room: paramText,
    code: paramText,
    q: paramText,
    status: paramText,
    showEmpty: paramFlag,
    view: paramText,
    serial: paramText,
    new: paramEnum(['true'] as const),
    edit: paramFlag,
  },
  carries: WORKBENCH_CARRIES,
});

/**
 * `/search` — the cross-entity results surface Phase 1 of the dashboard IA
 * rework evicted out of `?mode=search`.
 *
 * `?q=` is the query; Phase 2 adds client refine over the top-50 via
 * `?scope=` / `?hstat=` (namespaced away from `/support`'s `type`/`status`)
 * and display sort via carried ambient `?colsort=` (`relevance` default |
 * `date`). Declaring them here means a collision is a build failure rather
 * than a filter that quietly does nothing.
 */
const SEARCH_ROUTE_PARAMS = defineRouteParams({
  route: '/search',
  owns: {
    /** The query. Typing happens in the global header pill; this is the state. */
    q: paramText,
    /**
     * Durable selection on the search workbench — `order:123`, `receiving:50200`, …
     * Parsed by {@link parseSearchSel}. Deliberately NOT `openOrderId` / entity
     * open-params owned by other surfaces.
     */
    sel: paramText,
    /**
     * Client entity-type refine over the retrieved top-50.
     * UI vocabulary (order | unit | receiving | sku | repair | fba).
     * Deliberately NOT `type` — `/support` already owns that key.
     */
    scope: paramRoundTrip(parseSearchScopeWire),
    // Legacy alias: preserve old bookmarks until the next Search tab write.
    etype: paramRoundTrip(parseSearchEtypeWire),
    /**
     * Client status refine against `facets.status`.
     * Deliberately NOT `status` — `/support` (and others) already own that key.
     */
    hstat: paramText,
    /**
     * Client channel refine against `facets.source_platform`, holding the
     * STORED value (`ebay` / `amazon` / `ecwid`) rather than a display label so
     * a deep link survives a catalog rename. Deliberately NOT `platform` —
     * short key, and it keeps the search surface's params in one short family
     * (scope · hstat · chan).
     */
    chan: paramText,
  },
  carries: ['staff', 'colsort', 'coldir'],
});

/** Every still-query-mode surface with a declared spec. */
export const QUERY_MODE_ROUTE_PARAMS: readonly RouteParamsSpec[] = [
  SUPPORT_ROUTE_PARAMS,
  DASHBOARD_ROUTE_PARAMS,
  OPERATIONS_ROUTE_PARAMS,
  PRODUCTS_ROUTE_PARAMS,
  SOURCING_ROUTE_PARAMS,
  TEST_ROUTE_PARAMS,
  WALK_IN_ROUTE_PARAMS,
  INVENTORY_ROUTE_PARAMS,
  INVENTORY_LOCATIONS_ROUTE_PARAMS,
  REVIEW_ROUTE_PARAMS,
  PACK_ROUTE_PARAMS,
  WAREHOUSE_ROUTE_PARAMS,
  SEARCH_ROUTE_PARAMS,
  FORGE_ROUTE_PARAMS,
  // `/` is the shortest prefix in the registry, so it must never shadow another
  // route — the registry sorts longest-first, which keeps it last in practice.
  HOME_ROUTE_PARAMS,
];
