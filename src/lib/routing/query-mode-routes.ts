/** Param ownership for the surfaces that still switch mode via `?mode=`. */

import { parseLabelsView } from '@/components/labels/labels-view';
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
import { parseLabelCopiesWire } from '@/lib/print/labelCopies';
import {
  RECEIVING_HISTORY_URL_PARAMS,
  parseReceivingHistorySearchFieldWire,
  parseReceivingHistorySearchScopeWire,
} from '@/lib/receiving-history-search';
import { isRepairColumnSort } from '@/lib/repair/repair-display-sort';
import { parseSearchEtypeWire } from '@/lib/search/search-refine';
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
  paramCanonical,
  paramRoundTrip,
  paramText,
  type RouteParamsSpec,
} from './route-params';

/** Operator-level bits every workbench accepts on arrival. */
const WORKBENCH_CARRIES = ['staff', 'staffId', 'colsort', 'coldir', 'pane', 'layout', 'weekOffset'] as const;

/** `/support` — Tickets · Orders · Voicemail · Calls · Warranty · Issues. */
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

/** `/dashboard` — Search · Receiving · Outbound. */
const DASHBOARD_ROUTE_PARAMS = defineRouteParams({
  route: '/dashboard',
  owns: {
    /** Domain axis: `sales` / `pickup` / `repairs` (front-desk history) · legacy `inbound` / `receiving` / `search` / `outbound` (redirected). */
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
    /** HAND-OFF keys — read on this route only to be forwarded, never rendered. */
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


/** `/` (Daily) — the per-staff daily checklist, single surface. */
const HOME_ROUTE_PARAMS = defineRouteParams({
  route: '/',
  owns: {
    mode: paramRoundTrip(parseHomeModeWire),
    /** Daily's civil day (`YYYY-MM-DD`) — the durable state that makes a past checklist linkable to a colleague. */
    date: paramDateKey,
    /**
     * Daily checklist inspector selection (`HomeDailyMode`'s right-rail
     * occupant, unmounted with the scope-1 rewrite but returning). Declared
     * so the param survives navigation in the meantime.
     */
    item: paramPositiveInt,
    /** Daily's own filter vocabulary (status / text), unmounted with scope 1. */
    q: paramText,
    filter: paramText,
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

/** `/operations` — Live · Analytics · Insights · History · Signals · Plans. */
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

/** `/products` — Manuals · SKU Barcodes · Pairing · QC Checklist. */
export const PRODUCTS_ROUTE_PARAMS = defineRouteParams({
  route: '/products',
  owns: {
    view: paramRoundTrip(parseProductsView),
    /** Sidebar filter box — the same "narrow this list" question everywhere. */
    q: paramText,
    /** Pairing backlog ordering. */
    sort: paramEnum(PAIRING_SORTS),
    /** Selected catalog row on QC Checklist. */
    skuId: paramPositiveInt,
    /** Selected SKU on Pairing (the SKU string, not the catalog id). */
    sku: paramText,
    /** Labels sub-tab (Products · Recent · History) and its focused unit. */
    labelsView: paramRoundTrip(parseLabelsView),
    historyId: paramText,
    /** Selected manual on the Manuals view — `product_manuals.id`. */
    id: paramPositiveInt,
  },
  carries: WORKBENCH_CARRIES,
});

/** `/sourcing` — Queue · Scout · Watchlist · Searches · Suppliers · Analytics. */
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
    /**
     * Suppliers CRUD editor door (`<id>` or `new`) — swaps the rollup for the
     * ex-admin supplier card inside the Suppliers mode (admin dissolution).
     * Text, not int: `new` is a valid value.
     */
    supplier: paramText,
    /** Models CRUD editor door (`<id>` or `new`) — the Models mode's twin of `supplier`, read by `BoseModelsManagementTab` (admin dissolution). */
    model: paramText,
  },
  carries: WORKBENCH_CARRIES,
});

/** `/test` — the Testing station's Workbench half (Shipping | Testing). */
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
     * Station composer destination — `label` (default, omitted) · `ticket`.
     * Shared with Unbox / Arrival (`SHARED_OWNED_KEYS.composerMode`).
     */
    composerMode: paramEnum(['unbox', 'ticket', 'label'] as const),
  },
  carries: WORKBENCH_CARRIES,
});

/** `/walk-in` — retired Sales-history front door (redirects to `/dashboard?mode=sales|pickup|repairs`). */
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
    /** Legacy task deep-links, read by `useWalkInTaskRedirect` / proxy and forwarded to `/repair`. */
    openRepair: paramPositiveInt,
    new: paramEnum(['true'] as const),
    search: paramText,
  },
  carries: WORKBENCH_CARRIES,
});

/** `/inventory` — Ledger · Triage · Pulse · Graph · Replenish. */
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
    /** SKU-graph direction. */
    view: paramEnum(['parents', 'children', 'tree', 'parts'] as const),
  },
  carries: WORKBENCH_CARRIES,
});

/** `/inventory/locations` — Bin Tags · Bays · Rooms · Bins · Map (former `/warehouse` desk). */
const INVENTORY_LOCATIONS_ROUTE_PARAMS = defineRouteParams({
  route: '/inventory/locations',
  owns: {
    /** Bin Tags is the default and rides the bare URL. */
    tab: paramCanonical(parseLocationsTabWire),
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
  },
  carries: WORKBENCH_CARRIES,
});

/** `/inventory/stock` — the warehouse-wide (location, SKU) stock ledger. */
export const INVENTORY_STOCK_ROUTE_PARAMS = defineRouteParams({
  route: '/inventory/stock',
  owns: {
    /** The one search box, over every fact a record paints (server-side). */
    q: paramText,
    /** Room funnel — a comma-separated multi-select over `locations.room`. */
    room: paramText,
    /** Operational state funnel: open placeholders or catalog-paired stock. */
    status: paramText,
    /** The open stock pair (its record key) — the evidence column. */
    open: paramText,
    /** An on-hold SKU named by a compatibility/share link. */
    sku: paramText,
  },
  carries: WORKBENCH_CARRIES,
});

/** `/inventory/sku-exceptions` — the floor-minted placeholder SKU (`TMP-…`) record ledger. */
export const INVENTORY_SKU_EXCEPTIONS_ROUTE_PARAMS = defineRouteParams({
  route: '/inventory/sku-exceptions',
  owns: {
    /** The one search box, over every fact a record paints. */
    q: paramText,
    /** The open placeholder SKU (`TMP-…`) — opens it in the evidence column. */
    sku: paramText,
  },
  carries: WORKBENCH_CARRIES,
});

const SPECIAL_BIN_PRINT_ROUTE_PARAMS = defineRouteParams({
  route: '/inventory/locations/print/special-bin',
  owns: {
    barcode: paramText,
    /** Bulk copies — silent USB sends TSPL PRINT N in one job. Default 1 omitted. */
    count: paramRoundTrip(parseLabelCopiesWire),
  },
  carries: WORKBENCH_CARRIES,
});

/** The ex-`/admin/inventory` operations desks, re-homed under the desk that owns their data (admin dissolution). */
const INVENTORY_HEALTH_ROUTE_PARAMS = defineRouteParams({
  route: '/inventory/health',
  owns: {},
  carries: WORKBENCH_CARRIES,
});

const INVENTORY_CYCLE_COUNTS_ROUTE_PARAMS = defineRouteParams({
  route: '/inventory/cycle-counts',
  owns: {
    /** Server-action outcome flash (`missing_name` · `failed` · `invalid_qty`). */
    error: paramText,
    /** Line-status filter pills on the campaign detail page. */
    status: paramText,
  },
  carries: WORKBENCH_CARRIES,
});

const INVENTORY_HOLDS_ROUTE_PARAMS = defineRouteParams({
  route: '/inventory/holds',
  owns: {
    /** Hold / release action flash (`missing_input` · `not_found`). */
    error: paramText,
  },
  carries: WORKBENCH_CARRIES,
});

const INVENTORY_RETURNS_ROUTE_PARAMS = defineRouteParams({
  route: '/inventory/returns',
  owns: {
    /** Intake outcome flash + the serials the intake could not match. */
    ok: paramFlag,
    error: paramText,
    missing: paramText,
  },
  carries: WORKBENCH_CARRIES,
});

const INVENTORY_BULK_ALLOCATE_ROUTE_PARAMS = defineRouteParams({
  route: '/inventory/bulk-allocate',
  owns: {
    /** Zero-indexed offset page of allocation candidates. */
    page: paramText,
  },
  carries: WORKBENCH_CARRIES,
});

const INVENTORY_THROUGHPUT_ROUTE_PARAMS = defineRouteParams({
  route: '/inventory/throughput',
  owns: {
    /** Rolling window (`24h` · `7d` · `30d`). */
    range: paramText,
  },
  carries: WORKBENCH_CARRIES,
});

export const INVENTORY_EVENTS_ROUTE_PARAMS = defineRouteParams({
  route: '/inventory/events',
  owns: {
    event_type: paramText,
    station: paramText,
    sku: paramText,
    unit: paramText,
    actor: paramText,
    since: paramDateKey,
    until: paramDateKey,
    /** The table's find box — the same "narrow this list" question `q` already answers on `/inventory/sku-exceptions`, over every fact an event… */
    q: paramText,
    /** Zero-indexed offset page. */
    page: paramText,
  },
  carries: WORKBENCH_CARRIES,
});

/** `/review` — Packing · Pairing · Catalog link (the Packer Review Station). */
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

/** `/pack` — the packing station workbench. */
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

/** `/warehouse` — orphan children only (`/warehouse/rma`, `/warehouse/replenishment`). */
export const WAREHOUSE_ROUTE_PARAMS = defineRouteParams({
  route: '/warehouse',
  owns: {
    tab: paramCanonical(parseLocationsTabWire),
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

/** `/search` — the cross-entity results surface Phase 1 of the dashboard IA rework evicted out of `?mode=search`. */
const SEARCH_ROUTE_PARAMS = defineRouteParams({
  route: '/search',
  owns: {
    /** The query. Typing happens in the global header pill; this is the state. */
    q: paramText,
    /**
     * Entry treatment for a named workflow. `label` keeps an owned order-number
     * field visible on desktop instead of landing on the generic blank plane.
     */
    entry: paramText,
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
    etype: paramRoundTrip(parseSearchEtypeWire),
    /**
     * Client status refine against `facets.status`.
     * Deliberately NOT `status` — `/support` (and others) already own that key.
     */
    hstat: paramText,
    /** Client channel refine against `facets.source_platform`, holding the STORED value (`ebay` / `amazon` / `ecwid`) rather than a display… */
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
  SPECIAL_BIN_PRINT_ROUTE_PARAMS,
  INVENTORY_LOCATIONS_ROUTE_PARAMS,
  INVENTORY_STOCK_ROUTE_PARAMS,
  INVENTORY_SKU_EXCEPTIONS_ROUTE_PARAMS,
  // Ex-/admin/inventory desks, re-homed under the Inventory desk.
  INVENTORY_HEALTH_ROUTE_PARAMS,
  INVENTORY_CYCLE_COUNTS_ROUTE_PARAMS,
  INVENTORY_HOLDS_ROUTE_PARAMS,
  INVENTORY_RETURNS_ROUTE_PARAMS,
  INVENTORY_BULK_ALLOCATE_ROUTE_PARAMS,
  INVENTORY_THROUGHPUT_ROUTE_PARAMS,
  INVENTORY_EVENTS_ROUTE_PARAMS,
  REVIEW_ROUTE_PARAMS,
  PACK_ROUTE_PARAMS,
  WAREHOUSE_ROUTE_PARAMS,
  SEARCH_ROUTE_PARAMS,
  FORGE_ROUTE_PARAMS,
  // `/` is the shortest prefix in the registry, so it must never shadow another
  // route — the registry sorts longest-first, which keeps it last in practice.
  HOME_ROUTE_PARAMS,
];
