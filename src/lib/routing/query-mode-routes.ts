/** Param ownership for the surfaces that still switch mode via `?mode=`. */

import { parseLabelsView } from '@/components/labels/labels-view';
import { PAIRING_SORTS } from '@/components/products/pairing/types';
import { parseProductsView, PRODUCT_RECORD_PARAM } from '@/components/products/products-view';
import {
  parseSourcingAnalyticsRange,
  parseSourcingModeWire,
} from '@/components/sourcing/sourcing-shared';
import { parseOperationsModeWire } from '@/components/sidebar/operations/operations-sidebar-shared';
import { parseHomeModeWire } from '@/features/home/home-modes';
import { parseDashboardModeWire } from '@/lib/dashboard/dashboard-domains';
import { parseLocationsTabWire } from '@/lib/inventory/locations-path';
import { LOCATION_STOCK_SORTS } from '@/lib/inventory/location-stock-row';
import { parseQcLabelViewWire } from '@/lib/labels/qc-label-views';
import { parseLabelCopiesWire } from '@/lib/print/labelCopies';
import {
  RECEIVING_HISTORY_URL_PARAMS,
  parseReceivingHistorySearchFieldWire,
  parseReceivingHistorySearchScopeWire,
} from '@/lib/receiving-history-search';
import { parseRepairSort, REPAIR_SORT_PARAM } from '@/lib/repair/repair-sort';
import { REPAIR_CHANNELS, REPAIR_CHANNEL_PARAM } from '@/lib/repair/repair-channel';
import { REPAIR_STATUS_CHIP_PARAM } from '@/lib/repair/repair-status-chips';
import {
  parsePickupTab,
  parseRepairTab,
  parseSalesTab,
  parseWalkInHistoryModeWire,
} from '@/lib/walk-in/history-modes';
import { parsePackScanModeWire, parsePackWorkspaceTab } from '@/utils/pack-workspace-state';
import { parseShippingWorkspaceTab } from '@/utils/shipping-workspace-state';
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
import { TO_SHIP_QUEUE_FACET_PARAMS } from './to-ship-queue-params';
import { EXCEPTION_RECORD_ROUTE_PARAMS } from './desk-page-routes';

/** Operator-level bits every workbench accepts on arrival. */
const WORKBENCH_CARRIES = ['staff', 'staffId', 'colsort', 'coldir', 'pane', 'layout', 'weekOffset'] as const;

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
    /** Sales Board history Find; namespaced away from the Search hand-off `q`. */
    sq: paramText,
    /** HAND-OFF keys — read on this route only to be forwarded, never rendered. */
    warranty: paramPresence,
    fba: paramPresence,
    /** Support warranty deep-link: open claim id. */
    open: paramText,
    wstatus: paramText,
    wexp: paramText,
    /**
     * Shared search key — Support warranty filter, and the repair cards' Find
     * when `mode=repairs` (same param name as `/repair`).
     */
    search: paramText,
    /** Repair cards' sidebar Sort on Sales → Repairs (`?mode=repairs`). */
    [REPAIR_SORT_PARAM]: paramRoundTrip(parseRepairSort),
    /** Repair cards' client page (shared TriageCardList). */
    page: paramPositiveInt,
    /** Status chips right of the count (comma list, `REPAIR_STATUS_CHIP_KEYS`). */
    [REPAIR_STATUS_CHIP_PARAM]: paramText,
    /** Shared client-side status exclusion cut (`?hide=`). */
    hide: paramText,
    /** Repair record deep-link (Sales history may open a card; intake stays on `/repair`). */
    openRepair: paramPositiveInt,
    /** Sales → Repairs sidebar view: All (bare) · Shipped in (`shipment`) · Dropped off (`pickup`). */
    [REPAIR_CHANNEL_PARAM]: paramEnum(REPAIR_CHANNELS),
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


/** `/` (Tasks, was Daily) — the follow-up desk: tasks, the checklist, projects. */
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
    /** Tasks' sidebar-owned view, status, scope, order, grouping, and header Find. */
    tab: paramText,
    q: paramText,
    filter: paramText,
    scope: paramText,
    sort: paramText,
    group: paramText,
    /** Tasks' project focus — one project's rows (the board's project heading). */
    project: paramText,
    /** Tasks' layout: `columns` = wide triage, one column per type (the toolbar's List · Columns, `V`). */
    layout: paramText,
    /** The agenda row list's 1-based page (`useTriageCut`). */
    page: paramPositiveInt,
  },
  carries: WORKBENCH_CARRIES,
});

/** `/ops/photos` — Media Library source views and advanced filters. */
const MEDIA_LIBRARY_ROUTE_PARAMS = defineRouteParams({
  route: '/ops/photos',
  owns: {
    sourceScope: paramText,
    imageType: paramText,
    q: paramText,
    dateFrom: paramText,
    dateTo: paramText,
    sort: paramText,
    stage: paramText,
    staffId: paramText,
    label: paramText,
    damageDetected: paramText,
    hasAnalysis: paramText,
    documentType: paramText,
    outboundMedia: paramText,
  },
  carries: WORKBENCH_CARRIES,
});

/**
 * `/forge` — Plans Live (master-plan MDX + TicketStatus).
 *
 * Its own spec since 2026-08-19: the console moved off Home's `?mode=forge`
 * onto a real route, and a param vocabulary belongs to the route that owns it.
 */
const FORGE_ROUTE_PARAMS = defineRouteParams({
  route: '/forge',
  owns: {
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
    /**
     * Goals · Staff · Logs (ex-admin consoles): the stage picker's list filter
     * (the contextual Find), each view's list choice, the Logs actor, and the
     * picked log event. `staffId` (the picked staffer) rides the carries.
     */
    search: paramText,
    goalView: paramEnum(['behind', 'on-track', 'exceeded'] as const),
    staffView: paramEnum(['active', 'inactive', 'technician', 'packer'] as const),
    logKind: paramEnum(['audit', 'sal'] as const),
    actorStaffId: paramPositiveInt,
    eventId: paramText,
  },
  carries: WORKBENCH_CARRIES,
});

/** `/products` — All products · Manuals · SKU Barcodes · Pairing · QC Checklist. */
export const PRODUCTS_ROUTE_PARAMS = defineRouteParams({
  route: '/products',
  owns: {
    view: paramRoundTrip(parseProductsView),
    /** Sidebar filter box — the same "narrow this list" question everywhere. */
    q: paramText,
    /** Catalog-list controls live in the contextual sidebar. */
    catalogStatus: paramEnum(['active', 'inactive', 'attention', 'unlinked'] as const),
    catalogSort: paramEnum(['title', 'sku', 'channels', 'attention'] as const),
    /** Import products CSV: the staged file's review stands in for the catalog list while set. */
    import: paramEnum(['csv'] as const),
    /** The catalog product open in place on the list's record plane (its SKU). */
    [PRODUCT_RECORD_PARAM]: paramText,
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
    /** Models / Compatibility list filter — the sidebar Find on those views (`BoseModelPickerPane` reads it). */
    search: paramText,
    /** Compatibility picker selection — a `bose_models` row id. */
    boseModelId: paramPositiveInt,
  },
  carries: WORKBENCH_CARRIES,
});

/**
 * `/test` — the Quality Control bench. One mode: a legacy `?view=testing` is
 * not declared, so the boundary parse drops it and the bench still paints.
 */
export const TEST_ROUTE_PARAMS = defineRouteParams({
  route: '/test',
  owns: {
    /** Quality-control search. */
    q: paramText,
    search: paramText,
    /**
     * Station composer destination — `label` (default, omitted) · `ticket`.
     * Shared with Unbox / Arrival (`SHARED_OWNED_KEYS.composerMode`).
     */
    composerMode: paramEnum(['unbox', 'ticket', 'label'] as const),
  },
  carries: WORKBENCH_CARRIES,
});

/** `/pick` — the Picker desk: scan band + Pending / Urgent / History workspace. */
export const PICK_ROUTE_PARAMS = defineRouteParams({
  route: '/pick',
  owns: {
    /** Scan-history search (a tech-scan recent lands on `?ship=history&search=`). */
    search: paramText,
    q: paramText,
    /** Workspace tab — composes the tab SoT, never a re-typed list. */
    ship: paramRoundTrip(parseShippingWorkspaceTab),
    /** Armed packing DESK/STAGING filter (Picker placement). */
    packStation: paramPositiveInt,
    /** Any packing-station placement filter. */
    packPlaced: paramFlag,
    /** The Pending / Urgent queue is `UnshippedTable` + its filter menu (`?ship=urgent` writes `attention=1`). */
    ...TO_SHIP_QUEUE_FACET_PARAMS,
    /** New-order entry overlay (`useNewOrderParam`). */
    new: paramEnum(['true'] as const),
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
    /** Replenish (`section=replenish`): Need to order (bare or `need`) · Shipped FIFO. */
    rtab: paramEnum(['need', 'fifo'] as const),
    /** Replenish SKU filter. */
    rsku: paramText,
    /** Replenish request status (one of the active statuses). */
    rstatus: paramEnum(['detected', 'pending_review', 'planned_for_po', 'po_created', 'waiting_for_receipt'] as const),
    /** Replenish: the row list's 1-based page (`useTriageCut`). */
    page: paramPositiveInt,
  },
  carries: WORKBENCH_CARRIES,
});

/** `/inventory/locations` — All · Rooms · Racks · Map · Labels. */
const INVENTORY_LOCATIONS_ROUTE_PARAMS = defineRouteParams({
  route: '/inventory/locations',
  owns: {
    /** All is the default and rides the bare URL. */
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

/** `/inventory/stock` — the warehouse-wide (location, SKU) stock list (one-row triage). */
export const INVENTORY_STOCK_ROUTE_PARAMS = defineRouteParams({
  route: '/inventory/stock',
  owns: {
    /** Named stock workspace; absent = the complete stock ledger. */
    view: paramEnum(['replenish'] as const),
    /** Replenishment view's namespaced filters. */
    rsku: paramText,
    rtab: paramText,
    rstatus: paramText,
    /** The one search box, over every fact a record paints (server-side). */
    q: paramText,
    /** Room chips — a comma-separated multi-select over `locations.room` (the list's own cut, `useTriageCut`). */
    room: paramText,
    /** Numeric aisle multi-select, comma-separated. */
    aisle: paramText,
    /** Physical location order in the stock walk. */
    sort: paramEnum(LOCATION_STOCK_SORTS),
    /** Operational state funnel: open placeholders or catalog-paired stock. */
    status: paramText,
    /** The open stock pair (its record key) — the evidence column. */
    open: paramText,
    /** An on-hold SKU named by a compatibility/share link. */
    sku: paramText,
    /** The row list's 1-based page (`useTriageCut`). */
    page: paramPositiveInt,
  },
  carries: WORKBENCH_CARRIES,
});

/**
 * `/inventory/sku-exceptions` — Inventory › SKU Exceptions: the Exceptions hub
 * list locked to Missing pairs (owner 2026-09-28). `sku` is the legacy share
 * link the page redirects to its exception's `record` before anything paints.
 */
export const INVENTORY_SKU_EXCEPTIONS_ROUTE_PARAMS = defineRouteParams({
  route: '/inventory/sku-exceptions',
  owns: {
    /** Find, over the hub rows' entity / title / tag. */
    q: paramText,
    ...EXCEPTION_RECORD_ROUTE_PARAMS,
    /** The card list's 1-based page (`useTriageCut`). */
    page: paramPositiveInt,
    sku: paramText,
  },
  carries: WORKBENCH_CARRIES,
});

/**
 * `/inventory/triage` — Inventory › Tracking Exceptions: the Exceptions hub
 * list locked to Tracking (owner 2026-09-28). `open` is the legacy deep link
 * (a `tracking_exceptions` id) the page redirects to its `record`.
 */
const INVENTORY_TRACKING_EXCEPTIONS_ROUTE_PARAMS = defineRouteParams({
  route: '/inventory/triage',
  owns: {
    q: paramText,
    ...EXCEPTION_RECORD_ROUTE_PARAMS,
    /** The card list's 1-based page (`useTriageCut`). */
    page: paramPositiveInt,
    open: paramText,
  },
  carries: WORKBENCH_CARRIES,
});

/** `/inventory/qc-labels` — one record per labelled serial unit (the QC / pre-box sticker). */
const INVENTORY_QC_LABELS_ROUTE_PARAMS = defineRouteParams({
  route: '/inventory/qc-labels',
  owns: {
    /** All labels (bare) · In stock · On orders. */
    view: paramCanonical(parseQcLabelViewWire),
    /** Serial, unit id, SKU, title or order — server-side. */
    q: paramText,
    /** The open labelled unit (`serial_units.id`). */
    open: paramText,
    /** The row list's 1-based page (`useTriageCut`). */
    page: paramPositiveInt,
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

const INVENTORY_THROUGHPUT_ROUTE_PARAMS = defineRouteParams({
  route: '/inventory/throughput',
  owns: {
    /** Rolling window (`24h` · `7d` · `30d`). */
    range: paramText,
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
    /** The queue view is `UnshippedTable` + its filter menu (`ustatus` included). */
    ...TO_SHIP_QUEUE_FACET_PARAMS,
    /** New-order entry overlay (`useNewOrderParam`). */
    new: paramEnum(['true'] as const),
  },
  carries: WORKBENCH_CARRIES,
});

/** `/warehouse` — orphan child only (`/warehouse/replenishment`). */
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

/** Every still-query-mode surface with a declared spec. */
export const QUERY_MODE_ROUTE_PARAMS: readonly RouteParamsSpec[] = [
  DASHBOARD_ROUTE_PARAMS,
  OPERATIONS_ROUTE_PARAMS,
  PRODUCTS_ROUTE_PARAMS,
  SOURCING_ROUTE_PARAMS,
  TEST_ROUTE_PARAMS,
  PICK_ROUTE_PARAMS,
  WALK_IN_ROUTE_PARAMS,
  INVENTORY_ROUTE_PARAMS,
  SPECIAL_BIN_PRINT_ROUTE_PARAMS,
  INVENTORY_LOCATIONS_ROUTE_PARAMS,
  INVENTORY_STOCK_ROUTE_PARAMS,
  INVENTORY_SKU_EXCEPTIONS_ROUTE_PARAMS,
  INVENTORY_TRACKING_EXCEPTIONS_ROUTE_PARAMS,
  INVENTORY_QC_LABELS_ROUTE_PARAMS,
  // Ex-/admin/inventory desk, re-homed under the Inventory desk.
  INVENTORY_THROUGHPUT_ROUTE_PARAMS,
  PACK_ROUTE_PARAMS,
  WAREHOUSE_ROUTE_PARAMS,
  FORGE_ROUTE_PARAMS,
  MEDIA_LIBRARY_ROUTE_PARAMS,
  // `/` is the shortest prefix in the registry, so it must never shadow another
  // route — the registry sorts longest-first, which keeps it last in practice.
  HOME_ROUTE_PARAMS,
];
