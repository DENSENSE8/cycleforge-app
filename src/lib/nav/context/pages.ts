/**
 * Per-page sidebar surfaces — what the old context panel / desk chrome hosted
 * beside the tab row: the page search box, station scan input, saved views
 * and page-level verbs. Raw operational rows never belong in this declaration:
 * they stay in the central workspace. `resolveNavContext` stamps the
 * active page's (and active view's) declaration onto the `NavContext`.
 *
 * Pure data. Every entry cites the old UI it replaces (PARITY.md rows); the
 * parity gate (`parity.ts`) is what proves the declaration is complete.
 */

import { outboundSavedViewsConfig } from '@/components/unshipped/outbound-sidebar-shared';
import { walkInStationHref } from '@/lib/walk-in/jobs';
import type { NavRecentSurfaceId } from '@/lib/nav/recents/surfaces';
import type { NavAction, NavControls, NavSearch } from './schema';
import { RECON_PARAM, RECON_REASON_PARAM, REF_IN_PARAM } from '@/lib/receiving/reconcile';
import {
  SAVED_VIEW_PARAM_KEYS,
  SAVED_VIEW_STORAGE_KEY,
  STAFF_FILTER_PARAM,
  WEEK_OFFSET_PARAM,
} from '@/lib/station/table-url-params';
import { GRID_COLUMN_DIR_PARAM, GRID_COLUMN_SORT_PARAM } from '@/lib/tables/grid-column-sort-params';
import {
  DOCKED_DATE_FROM_PARAM,
  DOCKED_DATE_TO_PARAM,
  DOCKED_KIND_PARAM,
  INBOUND_FIND_PARAM,
  INBOUND_SOURCE_OPTIONS,
  INBOUND_SOURCE_PARAM,
} from '@/lib/receiving/inbound-lane';
import { DOCKED_KIND_OPTIONS } from '@/lib/receiving/docked-record-state';
import {
  SOURCING_ALERT_STATUS_OPTIONS,
  SOURCING_SCOUT_BY_OPTIONS,
  SOURCING_SUPPLIER_TYPE_OPTIONS,
  SOURCING_WATCH_STATUS_OPTIONS,
} from '@/components/sourcing/sourcing-shared';
import {
  LOCATIONS_TAB_OPTIONS,
  REPLENISH_STATUS_OPTIONS,
  REPLENISH_TAB_OPTIONS,
} from '@/lib/inventory/inventory-nav-choices';
import { JOURNEY_FILTER_KEYS, OPERATIONS_SAVED_VIEWS_KEY } from '@/lib/operations/saved-view-presets';
import { DEFAULT_REPAIR_SORT, REPAIR_SORT_OPTIONS, REPAIR_SORT_PARAM } from '@/lib/repair/repair-sort';
import { REPAIR_STATUS_CHIP_PARAM } from '@/lib/repair/repair-status-chips';
import { LIFECYCLE } from '@/design-system/tokens/lifecycle';
import { QUEUE_STATUS_CHIPS } from '@/lib/orders/to-ship-queue';

/**
 * The import record (`/operations/imports`, `src/lib/imports/params.ts`) —
 * handoff import-history §6. Both views: the window (PT, with times; unset =
 * the last 7 days) and the trigger. Runs adds who ran it; status and the
 * multi-value facets (source · platform · account · outcome) are the facet
 * contexts `imports.runs` / `imports.rows`, counted. A narrower list from
 * page 3 would land past its end, so every filter drops `page`.
 */
const IMPORTS_WINDOW: NonNullable<NavControls['dateRanges']> = [
  {
    id: 'imported',
    label: 'Imported',
    fromParam: 'dateFrom',
    toParam: 'dateTo',
    clearParams: ['page'],
    placeholder: 'Last 7 days',
    fromTimeParam: 'timeFrom',
    toTimeParam: 'timeTo',
  },
];
const IMPORTS_TRIGGER: NonNullable<NavControls['choices']>[number] = {
  id: 'trigger',
  label: 'Trigger',
  param: 'trigger',
  options: [
    { value: 'cron', label: 'Scheduled' },
    { value: 'manual', label: 'Manual' },
  ],
  clearParams: ['page'],
};
const IMPORT_RUNS_CONTROLS: NavControls = {
  staff: [{ id: 'run-by', param: 'staff', label: 'Run by' }],
  dateRanges: IMPORTS_WINDOW,
  choices: [IMPORTS_TRIGGER],
  sort: {
    param: 'sort',
    defaultValue: 'newest',
    options: [
      { value: 'newest', label: 'Newest first' },
      { value: 'inserted', label: 'Most inserted first' },
      { value: 'failed', label: 'Most failed first' },
    ],
  },
};
const IMPORT_ROWS_CONTROLS: NavControls = {
  dateRanges: IMPORTS_WINDOW,
  choices: [IMPORTS_TRIGGER],
  sort: {
    param: 'sort',
    defaultValue: 'newest',
    options: [
      { value: 'newest', label: 'Newest first' },
      { value: 'order', label: 'Order number, A to Z' },
    ],
  },
};

/** A page-level verb plus the permission its door needs (never on the wire). */
export interface NavActionDecl {
  action: NavAction;
  requires?: string;
}

/** A page search box — the list it narrows reads `param` (url-param) or the desk store. */
export type NavSearchDecl = Omit<NavSearch, 'scope'>;

/**
 * A contextual sidebar may list navigation destinations, never operational
 * records. Chat threads are navigation; cartons, orders, packs, tickets,
 * scans and print jobs are data and remain in the central workspace.
 */
export const NAV_SIDEBAR_NAVIGATION_SURFACE = 'assistant.sessions' as const satisfies NavRecentSurfaceId;

export interface NavSurfaceDecl {
  search?: NavSearchDecl;
  recents?: typeof NAV_SIDEBAR_NAVIGATION_SURFACE;
  scanInput?: { grammar: NavScanGrammar; endpoint: string };
  savedViews?: { storageKey: string; paramKeys: readonly string[] };
  actions?: readonly NavActionDecl[];
  /** Keep page-wide utility verbs in the contextual body instead of the desk header. */
  actionsPlacement?: 'sidebar';
  /** Non-facet view filters (staff picker, date range) the view's list reads. */
  controls?: NavControls;
}

export interface NavPageDecl extends NavSurfaceDecl {
  /** Overrides for one section item (child / desk view id); item fields win. */
  items?: Readonly<Record<string, NavSurfaceDecl>>;
  /**
   * The page has no views: its navigation list IS its panel (Chat's threads).
   * There is no desk header over that list, so its `actions` ride the `‹`
   * back row as glyph buttons (`NAV_ACTION_ICONS`). Resolves `section` scope
   * with no view rows.
   */
  recentsPanel?: true;
  /**
   * Bare `1`–`9` open the page's views in painted order, and the keys are
   * taught everywhere the views are painted (the view block's hover card,
   * the desk header's pills). Opt-in: a page must first prove no other bare
   * digit is bound there (a record's `EvidenceDecisionBar` owns 1–4).
   */
  viewKeys?: true;
  /**
   * The page's OWN modes (owner 2026-09-28, Exceptions): painted as the same
   * `.modes` section a door lane's modes are, so `NavModeSwitcher` renders
   * the card and its dropdown unchanged. Each UNGROUPED child is a mode; each
   * GROUPED child is a view of the mode whose id is its `group`, painted under
   * the card (the view switcher, digits when `viewKeys`) only while that mode
   * is current. There is no "all" mode (owner 2026-09-29: never a blanket
   * list): a mode opens its first view, and the page itself lands every URL
   * on one view. A mode's secondary line lists its views.
   */
  modes?: {
    /** The card's aria name for the tier, e.g. "Domain". */
    label: string;
  };
}

/**
 * Scan grammars — the wire value of `scanInput.grammar`, one per classifier a
 * station bar runs before it submits:
 * - `arrival`: command → (batch sort) location → tracking (`classifyArrivalScan`);
 * - `unbox`: ticket · tracking · PO, receiving handles (`useTrackingScan`);
 * - `pickup`: id → exact PO/ref → customer → unique partial (`resolvePickupScan`, client-side);
 * - `testing`: handle/unit/serial → PO → tracking → partial → SKU (`resolveTestingScan`);
 * - `station`: command → unit key → handle → SKU → FNSKU → tracking → serial (`detectStationScanType`);
 * - `pack`: unit QR → FNSKU → tracking → packing log (`PackScanColumn`);
 * - `scan-out`: tracking-shaped commits, anything else is a note (`isScanOutTrackingCommit`);
 * - `fnsku`: FNSKU / ASIN / FBA shipment id (`useFbaScanRouting`).
 */
export const NAV_SCAN_GRAMMARS = [
  'arrival',
  'unbox',
  'pickup',
  'testing',
  'station',
  'pack',
  'scan-out',
  'fnsku',
] as const;

export type NavScanGrammar = (typeof NAV_SCAN_GRAMMARS)[number];

const UNSHIPPED_VIEWS = outboundSavedViewsConfig('unshipped');
const SHIPPED_VIEWS = outboundSavedViewsConfig('shipped');

const DOCKED_VIEWS = {
  storageKey: SAVED_VIEW_STORAGE_KEY.receiving_history,
  paramKeys: SAVED_VIEW_PARAM_KEYS.receiving_history,
};

/**
 * Deliveries › Docked is package-first: arrival scanned, not yet opened on
 * Unbox. Deliveries › Unboxed is the separate opened-carton history. Their
 * controls live here in the contextual sidebar, never over either list.
 */
const DOCKED_CONTROLS: NavControls = {
  staff: [{ id: 'handled-by', param: STAFF_FILTER_PARAM, label: 'Handled by' }],
  dateRanges: [
    {
      id: 'arrival',
      label: 'Arrival date',
      fromParam: DOCKED_DATE_FROM_PARAM,
      toParam: DOCKED_DATE_TO_PARAM,
      clearParams: [WEEK_OFFSET_PARAM],
      placeholder: 'All time',
    },
  ],
  choices: [{ id: 'kind', label: 'Kind', param: DOCKED_KIND_PARAM, options: [...DOCKED_KIND_OPTIONS], clearParams: [] }],
  sort: {
    param: GRID_COLUMN_SORT_PARAM,
    dirParam: GRID_COLUMN_DIR_PARAM,
    defaultValue: 'date',
    options: [
      { value: 'date', label: 'Latest arrival scan first' },
      { value: 'order', label: 'Purchase order, A to Z', dir: 'asc' },
      { value: 'title', label: 'Product, A to Z', dir: 'asc' },
      { value: 'qty', label: 'Largest quantity first', dir: 'desc' },
      { value: 'tracking', label: 'Tracking, A to Z', dir: 'asc' },
    ],
  },
};

const UNBOXED_CONTROLS: NavControls = {
  ...DOCKED_CONTROLS,
  dateRanges: [
    {
      id: 'unboxed',
      label: 'Unboxed date',
      fromParam: DOCKED_DATE_FROM_PARAM,
      toParam: DOCKED_DATE_TO_PARAM,
      clearParams: [WEEK_OFFSET_PARAM],
      placeholder: 'All time',
    },
  ],
  sort: {
    ...DOCKED_CONTROLS.sort!,
    options: [
      { value: 'date', label: 'Latest unboxed first' },
      { value: 'order', label: 'Purchase order, A to Z', dir: 'asc' },
      { value: 'title', label: 'Product, A to Z', dir: 'asc' },
      { value: 'qty', label: 'Largest quantity first', dir: 'desc' },
      { value: 'tracking', label: 'Tracking, A to Z', dir: 'asc' },
    ],
  },
};

const PIPELINE_VIEWS = {
  storageKey: SAVED_VIEW_STORAGE_KEY.receiving_incoming,
  paramKeys: SAVED_VIEW_PARAM_KEYS.receiving_incoming,
};

/**
 * Inbound (`/incoming`), formerly its ledger toolbar. Source: the
 * Filter funnel's purchasing-source group (`?inbound=`, the list endpoint's
 * facet). Sort: the Sort icon — the ledger's column order over the page
 * (`useUrlColumnSort`, `?colsort=`/`?coldir=`); unset = the urgency sections
 * the server pages by.
 */
const PIPELINE_CONTROLS: NavControls = {
  // A narrower list from page 3 would land past its end: the old funnel dropped `page` too.
  choices: [
    { id: 'source', label: 'Source', param: INBOUND_SOURCE_PARAM, options: [...INBOUND_SOURCE_OPTIONS], clearParams: ['page'] },
  ],
  sort: {
    param: GRID_COLUMN_SORT_PARAM,
    dirParam: GRID_COLUMN_DIR_PARAM,
    defaultValue: 'urgency',
    options: [
      { value: 'urgency', label: 'Most urgent first' },
      { value: 'date', label: 'Expected date, soonest first', dir: 'asc' },
      { value: 'age', label: 'Oldest first', dir: 'desc' },
      { value: 'status', label: 'Delivery state', dir: 'asc' },
      { value: 'order', label: 'Purchase order, A to Z', dir: 'asc' },
      { value: 'title', label: 'Product, A to Z', dir: 'asc' },
      { value: 'tracking', label: 'Tracking, A to Z', dir: 'asc' },
      { value: 'qty', label: 'Largest quantity first', dir: 'desc' },
      { value: 'condition', label: 'Condition', dir: 'asc' },
      { value: 'platform', label: 'Source, A to Z', dir: 'asc' },
      { value: 'zoho', label: 'Zoho status', dir: 'asc' },
    ],
  },
};

/**
 * FBM's queue list (Allocate). Staff roles: the
 * universal `?staff=` assignee filter (`STAFF_FILTER_PARAM`, `sqlOrderAssignedToStaff`)
 * and `?pickedBy=` — who ACTUALLY picked (`PICK_FACTS_LATERALS`), plus the
 * pick / pack assignees the list already reads (`?pickerId=` / `?packedBy=`). Dates: order date and ship-by
 * (PT civil days). Sort: the queue's own `?sort=`/`?dir=` alphabet
 * (`queue-display-sort.ts`), ship-by soonest first by default — every view
 * and column order the list header's retired ⇅ menu offered (2026-09-27);
 * platform / carrier name pins stay out (filters in disguise).
 */
const QUEUE_CONTROLS: NavControls = {
  staff: [
    { id: 'assigned', param: 'staff', label: 'Assigned' },
    { id: 'picked-by', param: 'pickedBy', label: 'Picked by' },
    { id: 'packer', param: 'packedBy', label: 'Packer' },
    { id: 'picker', param: 'pickerId', label: 'Picker' },
  ],
  dateRanges: [
    { id: 'ship-by', label: 'Ship-by date', fromParam: 'shipByFrom', toParam: 'shipByTo', clearParams: [], placeholder: 'Any day' },
    { id: 'ordered', label: 'Order date', fromParam: 'orderFrom', toParam: 'orderTo', clearParams: [], placeholder: 'Any day' },
  ],
  exclude: {
    id: 'exclude-status',
    label: 'Exclude status',
    param: 'hide',
    options: QUEUE_STATUS_CHIPS.map((value) => ({ value, label: LIFECYCLE[value].label, tone: LIFECYCLE[value].tone })),
  },
  sort: {
    param: 'sort',
    dirParam: 'dir',
    defaultValue: 'deadline',
    options: [
      { value: 'deadline', label: 'Ship by, soonest first' },
      { value: 'age', label: 'Most overdue first', dir: 'desc' },
      { value: 'newest', label: 'Newest orders first' },
      { value: 'order', label: 'Order number, A to Z', dir: 'asc' },
      { value: 'title', label: 'Product title, A to Z', dir: 'asc' },
      { value: 'status', label: 'Status', dir: 'asc' },
      { value: 'picked', label: 'Picked, most recent first', dir: 'desc' },
      { value: 'picker', label: 'Picker, A to Z', dir: 'asc' },
      { value: 'packed', label: 'Packed, most recent first', dir: 'desc' },
      { value: 'scanned_out', label: 'Scanned out, latest first', dir: 'desc' },
      { value: 'qty', label: 'Largest quantity first', dir: 'desc' },
      { value: 'amount', label: 'Highest value first', dir: 'desc' },
      { value: 'tracking', label: 'Tracking number, A to Z', dir: 'asc' },
      { value: 'carrier', label: 'Carrier, A to Z', dir: 'asc' },
    ],
  },
};

/**
 * Repair service's `RepairCardList` on `/repair` and Sales › Repair service.
 * Status (`?tab=`; unset = the surface's default) decides what is loaded;
 * status chips (`?repairStatus=`) narrow within it. Channel is the view
 * (All · Shipped in · Dropped off). Sidebar Sort
 * (`?sort=`) sets the queue order.
 */
const REPAIR_CONTROLS: NavControls = {
  choices: [
    {
      id: 'status',
      label: 'Status',
      param: 'tab',
      options: [
        { value: 'open', label: 'Open' },
        { value: 'active', label: 'In the store' },
        { value: 'incoming', label: 'Arriving' },
        { value: 'done', label: 'Closed' },
        { value: 'all', label: 'All' },
      ],
      clearParams: ['page', REPAIR_STATUS_CHIP_PARAM],
    },
  ],
  exclude: {
    id: 'exclude-status',
    label: 'Exclude status',
    param: 'hide',
    options: [
      { value: 'arriving', label: 'Arriving', tone: 'info' },
      { value: 'needs-work', label: 'Still needs work', tone: 'warning' },
      { value: 'completed', label: 'Completed', tone: 'success' },
      { value: 'closed', label: 'Closed', tone: 'neutral' },
      { value: 'other', label: 'Other', tone: 'neutral' },
    ],
  },
  sort: {
    param: REPAIR_SORT_PARAM,
    defaultValue: DEFAULT_REPAIR_SORT,
    options: REPAIR_SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
  },
};

/** The repair cards' saved views — held Shift paints their digits (`SavedViewPresets`). */
const REPAIR_VIEWS = {
  storageKey: SAVED_VIEW_STORAGE_KEY.repair_queue,
  paramKeys: SAVED_VIEW_PARAM_KEYS.repair_queue,
};

/**
 * Shipped's period picker (`useShippedTableFilters.setPeriodRange`), now with
 * a time of day at each end (`timeFrom`/`timeTo`, PT), plus who shipped it:
 * `?staff=` (`effStaffId`), `?pickedBy=`, `?packedBy=`.
 */
const SHIPPED_CONTROLS: NavControls = {
  staff: [
    { id: 'any', param: 'staff', label: 'Staff' },
    { id: 'picked-by', param: 'pickedBy', label: 'Picked by' },
    { id: 'packed-by', param: 'packedBy', label: 'Packed by' },
  ],
  dateRanges: [
    {
      id: 'shipped',
      label: 'Fulfilled',
      fromParam: 'dateFrom',
      toParam: 'dateTo',
      clearParams: ['shippedWeekOffset', 'allDates'],
      // No range = every shipped package (`shippedEffectiveDateWindow`'s all-time default).
      placeholder: 'All dates',
      fromTimeParam: 'timeFrom',
      toTimeParam: 'timeTo',
    },
  ],
  sort: {
    param: 'sort',
    defaultValue: 'ship_confirmed_at',
    options: [
      { value: 'ship_confirmed_at', label: 'Scanned out, newest' },
      { value: 'ship_confirmed_at_asc', label: 'Scanned out, oldest' },
      { value: 'delivered_at', label: 'Delivered, newest' },
      { value: 'status', label: 'Carrier state' },
      { value: 'sale_amount', label: 'Order total' },
    ],
  },
};

/** The To-ship desk header (OrdersDeskAddAction · Past imports · Labels walk), removed 2026-09-26. */
const TO_SHIP_ACTIONS: readonly NavActionDecl[] = [
  // Face = the page's manual verb (owner 2026-09-28). Syncing, demo sync, test
  // orders and Labels left this menu: syncing is the global header Sync (its
  // history — past imports — is Operations › Sync); the Labels walk keeps `L`.
  { action: { id: 'orders.add', label: 'Add manual order', href: '/orders/new' } },
  {
    action: { id: 'orders.upload-csv', label: 'Upload orders CSV', intent: 'orders-intake:file' },
    requires: 'orders.import',
  },
  { action: { id: 'orders.export-csv', label: 'Export to CSV', intent: 'desk-export:csv' } },
];

/**
 * The Labels & docs header split CTA (handoff print-stations §3.2): three bulk
 * prints by stock, then the two bulk uploads. A print view's face is its own
 * stock and carries ⌘P (the desk binds ⌘P to "print all of this view's
 * stock"); Printed has no stock of its own, so no verb there wears ⌘P.
 * Uploads' face is the upload itself (⌘O rides it everywhere), then the labels.
 */
function labelsDocsActions(view: 'uploads' | 'labels' | 'paperwork' | 'printed'): readonly NavActionDecl[] {
  const printKey = (stock: 'labels' | 'paperwork') => (view === stock ? { hotkey: 'mod+p' } : {});
  const printLabels: NavAction = { id: 'labels-docs.print-labels', label: 'Print all labels', intent: 'labels-docs:print-labels', ...printKey('labels') };
  const printPaperwork: NavAction = { id: 'labels-docs.print-paperwork', label: 'Print all paperwork', intent: 'labels-docs:print-paperwork', ...printKey('paperwork') };
  const printAll: NavAction = { id: 'labels-docs.print-all', label: 'Print all (labels + paperwork)', intent: 'labels-docs:print-all' };
  const upload: NavAction = { id: 'labels-docs.upload', label: 'Upload label PDFs', intent: 'labels-docs:upload', hotkey: 'mod+o' };
  const uploadSlips: NavAction = { id: 'labels-docs.upload-slips', label: 'Upload packing slips', intent: 'labels-docs:upload-slips' };
  // In-app ShipStation buying (owner 2026-09-28): the Labels view's face opens the focused Buy a label page — no order required.
  const buyLabel: NavAction = { id: 'labels-docs.buy-label', label: 'Buy label', href: '/shipping/buy-label' };
  const order =
    view === 'uploads' ? [upload, printLabels, printPaperwork, printAll, uploadSlips]
    : view === 'paperwork' ? [uploadSlips, printPaperwork, printLabels, printAll, upload]
    : view === 'labels' ? [buyLabel, printLabels, printPaperwork, printAll, upload, uploadSlips]
    : [printLabels, printPaperwork, printAll, upload, uploadSlips];
  return order.map((action) => ({ action }));
}

export const NAV_PAGE_DECLS: Readonly<Record<string, NavPageDecl>> = {
  // The MasterNav Chat row's `+` and its thread list (`SidebarNavList.tsx`
  // Chat branches → `ChatSessionsNav`). Find narrows the threads (the desk
  // store keyed by `/ai-chat`; the page itself reads no `q`). New chat's
  // chord is the chat body's own (`useSessionHotkeys`: ⌘⇧O / Ctrl+Shift+O —
  // ⌘N is Chrome's new window in a tab).
  'ai-chat': {
    recentsPanel: true,
    search: { placeholder: 'Search chats', source: 'desk-store' },
    recents: 'assistant.sessions',
    actions: [{ action: { id: 'chat.new', label: 'New chat', intent: 'ai-chat:new', hotkey: 'mod+shift+o' } }],
  },
  // Search for the Shipping views comes from `DESK_VIEWS` (the desk store).
  // Fulfilled is its own page; its controls used to live on `outbound.items.shipped`.
  outbound: {
    viewKeys: true,
    items: {
      triage: { savedViews: UNSHIPPED_VIEWS, actions: TO_SHIP_ACTIONS, controls: QUEUE_CONTROLS },
    },
  },
  fulfilled: {
    viewKeys: true,
    items: {
      all: { savedViews: SHIPPED_VIEWS, controls: SHIPPED_CONTROLS },
      online: { savedViews: SHIPPED_VIEWS, controls: SHIPPED_CONTROLS },
      fba: { savedViews: SHIPPED_VIEWS, controls: SHIPPED_CONTROLS },
      sku: { savedViews: SHIPPED_VIEWS, controls: SHIPPED_CONTROLS },
      delivered: { savedViews: SHIPPED_VIEWS, controls: SHIPPED_CONTROLS },
    },
  },
  // Header split action `IncomingDeskAddAction` — the Global Add inbound leaves.
  // Find narrows the ledger in place through `?find=` (`INBOUND_FIND_PARAM`;
  // the ledger toolbar's old "Filter incoming…" field), so a reload, a shared
  // link and a saved view keep it; the card faces open an exact hit
  // (`receiptExactFind` / `cartonExactFind`).
  // Inbound also takes a pasted vendor list, located per number by
  // `GET /api/nav/locate` (the inbound locator).
  // `viewKeys`: 1 Inbound · 2 Docked · 3 Unboxed. No bare digit is bound on /incoming
  // (the status chips are ⌥1–⌥N, `segment-chords.ts`; no EvidenceDecisionBar).
  incoming: {
    viewKeys: true,
    items: {
      pipeline: {
        search: {
          placeholder: 'Search inbound deliveries',
          source: 'url-param',
          param: INBOUND_FIND_PARAM,
          locate: { locator: 'inbound', param: REF_IN_PARAM, statusParam: RECON_PARAM, facetParam: RECON_REASON_PARAM },
        },
        savedViews: PIPELINE_VIEWS,
        controls: PIPELINE_CONTROLS,
      },
      docked: {
        search: {
          placeholder: 'Find tracking or last digits',
          source: 'url-param',
          param: INBOUND_FIND_PARAM,
          locate: { locator: 'inbound', param: REF_IN_PARAM, statusParam: RECON_PARAM, facetParam: RECON_REASON_PARAM },
        },
        savedViews: DOCKED_VIEWS,
        controls: DOCKED_CONTROLS,
      },
      unboxed: {
        search: {
          placeholder: 'Search unboxed cartons',
          source: 'url-param',
          param: INBOUND_FIND_PARAM,
          locate: { locator: 'inbound', param: REF_IN_PARAM, statusParam: RECON_PARAM, facetParam: RECON_REASON_PARAM },
        },
        savedViews: DOCKED_VIEWS,
        controls: UNBOXED_CONTROLS,
      },
    },
    actions: [
      { action: { id: 'incoming.add-po', label: 'Add purchase order', intent: 'global-add:incoming-po' } },
      { action: { id: 'incoming.add-return', label: 'Add return', intent: 'global-add:incoming-return' } },
      {
        action: { id: 'incoming.import-returns', label: 'Import returns (CSV/TSV)', intent: 'global-add:incoming-returns-csv' },
      },
      { action: { id: 'incoming.import-zoho', label: 'Import Zoho POs', intent: 'global-add:incoming-zoho' } },
      {
        action: { id: 'incoming.import-ebay', label: 'Import eBay purchases', intent: 'global-add:incoming-ebay' },
        requires: 'integrations.ebay',
      },
    ],
  },
  // Sourcing (Inbound lane, `G S`): the views were the desk tab row, the
  // filters were the old context panel's pill sliders (`SourcingSidebarPanel`,
  // deleted) — each is one `choices` row on the view whose list reads it
  // (`sourcing-shared.ts` holds the vocabularies and why each omits its
  // default). The Models / Compatibility picker is in the stage
  // (`BoseModelPickerPane`). `viewKeys`: no other bare digit is bound here.
  // Find is per view: only Scout and Suppliers read `?q=` and Models /
  // Compatibility `?search=`; Queue · Watchlist · Searches have no list
  // filter, so they show the ⌘K face rather than a field that does nothing.
  sourcing: {
    viewKeys: true,
    items: {
      queue: {
        controls: {
          choices: [
            { id: 'status', label: 'Status', param: 'status', options: [...SOURCING_ALERT_STATUS_OPTIONS], clearParams: [] },
          ],
        },
      },
      scout: {
        search: { placeholder: 'Model number or serial…', source: 'url-param', param: 'q' },
        controls: {
          choices: [{ id: 'by', label: 'Look up by', param: 'by', options: [...SOURCING_SCOUT_BY_OPTIONS], clearParams: [] }],
        },
      },
      watchlist: {
        controls: {
          choices: [
            { id: 'status', label: 'Status', param: 'status', options: [...SOURCING_WATCH_STATUS_OPTIONS], clearParams: [] },
          ],
        },
      },
      suppliers: {
        search: { placeholder: 'Filter suppliers…', source: 'url-param', param: 'q' },
        controls: {
          choices: [{ id: 'type', label: 'Type', param: 'type', options: [...SOURCING_SUPPLIER_TYPE_OPTIONS], clearParams: [] }],
        },
      },
      models: {
        search: { placeholder: 'Filter models…', source: 'url-param', param: 'search' },
        actions: [{ action: { id: 'sourcing.add-model', label: 'Add model', href: '/sourcing?mode=models&model=new' } }],
      },
      compatibility: { search: { placeholder: 'Filter models…', source: 'url-param', param: 'search' } },
    },
  },
  products: {
    viewKeys: true,
    search: { placeholder: 'Search SKU, item number, product or platform…', source: 'url-param', param: 'q' },
    items: {
      catalog: {
        search: { placeholder: 'Search SKU, item number, product or platform…', source: 'url-param', param: 'q' },
        controls: {
          choices: [
            {
              id: 'catalog-status',
              label: 'Status',
              param: 'catalogStatus',
              options: [
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
                { value: 'attention', label: 'Needs attention' },
                { value: 'unlinked', label: 'Inventory unlinked' },
              ],
              clearParams: [],
            },
          ],
          sort: {
            param: 'catalogSort',
            defaultValue: 'title',
            options: [
              { value: 'title', label: 'Product title, A to Z' },
              { value: 'sku', label: 'SKU, A to Z' },
              { value: 'channels', label: 'Most channels first' },
              { value: 'attention', label: 'Needs attention first' },
            ],
          },
        },
      },
      manuals: { search: { placeholder: 'Search manuals', source: 'url-param', param: 'q' } },
      labels: {
        search: { placeholder: 'Search the catalog', source: 'url-param', param: 'q' },
      },
      pairing: {
        search: { placeholder: 'Filter SKU, title, or any platform ID…', source: 'url-param', param: 'q' },
        actions: [
          { action: { id: 'pairing.pair-identifier', label: 'Pair identifier', intent: 'pairing:pair-identifier' } },
          { action: { id: 'pairing.add-sku', label: 'Add SKU', intent: 'pairing:add-sku' } },
        ],
      },
      qc: { search: { placeholder: 'Filter products…', source: 'url-param', param: 'q' } },
    },
  },
  // Inventory (lane door, `G I`): the painted views are Stock · SKU Exceptions ·
  // Ledger · Replenish · Locations (the rest are parked, `parked-tabs.ts`), so
  // digits bind 1–5. Stock's Find, aisle facet, location order and state live
  // in the contextual sidebar; Rooms remain counted stage chips because their
  // labels are tenant data. Ledger reads no `q` — its face is ⌘K.
  inventory: {
    viewKeys: true,
    items: {
      stock: {
        search: { placeholder: 'Title, SKU, location, room or qty…', source: 'url-param', param: 'q' },
        controls: {
          sort: {
            param: 'sort',
            defaultValue: 'location-asc',
            options: [
              { value: 'location-asc', label: 'Earliest location first' },
              { value: 'location-desc', label: 'Latest location first' },
            ],
          },
        },
      },
      // The Exceptions hub list locked to Missing pairs (owner 2026-09-28): Find narrows it through `?q=`.
      'sku-exceptions': {
        search: { placeholder: 'SKU, title or order…', source: 'url-param', param: 'q' },
      },
      replenish: {
        search: { placeholder: 'Filter SKU…', source: 'url-param', param: 'rsku' },
        controls: {
          choices: [
            { id: 'rtab', label: 'List', param: 'rtab', options: [...REPLENISH_TAB_OPTIONS], clearParams: [] },
            { id: 'rstatus', label: 'Status', param: 'rstatus', options: [...REPLENISH_STATUS_OPTIONS], clearParams: [] },
          ],
        },
      },
      locations: {
        search: { placeholder: 'Filter bins…', source: 'url-param', param: 'q' },
        controls: {
          choices: [{ id: 'tab', label: 'Tool', param: 'tab', options: [...LOCATIONS_TAB_OPTIONS], clearParams: ['code', 'edit', 'new'] }],
        },
      },
    },
  },
  // QC labels (Inventory lane mode, `G Q`): one record per labelled unit. Find
  // narrows the server list (`?q=`); Print is the desk's primary verb (the
  // ledger registers the intent while it is mounted).
  'qc-labels': {
    viewKeys: true,
    search: { placeholder: 'Serial, unit id, SKU or order…', source: 'url-param', param: 'q' },
    actions: [
      { action: { id: 'qc-labels.print', label: 'Print QC label', intent: 'qc-labels:print' }, requires: 'print.label' },
    ],
  },
  // Print station (owner 2026-09-29): Find is the master route to an FNSKU — it
  // narrows the FBA catalog on the server (`?q=`); an exact FNSKU opens it.
  'print-station': {
    viewKeys: true,
    search: { placeholder: 'FNSKU, ASIN, SKU or title…', source: 'url-param', param: 'q' },
  },
  support: {
    items: {
      tickets: {
        search: { placeholder: 'Search tickets…', source: 'url-param', param: 'tq' },
      },
      calls: {
        search: { placeholder: 'Search caller or number…', source: 'url-param', param: 'q' },
      },
      warranty: {
        search: { placeholder: 'Search warranty claims…', source: 'url-param', param: 'search' },
      },
    },
  },
  'ops-photos': {
    viewKeys: true,
    search: {
      placeholder: 'Find order, tracking, serial, SKU, ticket or text…',
      source: 'url-param',
      param: 'q',
    },
  },
  // Operations (Monitor). History's saved views are its own store (system
  // presets + `/api/operations/saved-views`, painted by NavFilters through the
  // journey URL state). Goals · Staff · Logs were admin consoles whose rail
  // was a picker: the pickers moved into the stage (`GoalsPickerPane`,
  // `StaffPickerPane`, `LogsPickerPane`, left of the record) and their list
  // filters are these: Find narrows the picker (`?search=`), a choice picks
  // the slice, Logs adds the actor. A pick writes `staffId` / `eventId`.
  operations: {
    items: {
      'packing-review': {
        search: { placeholder: 'Filter order, SKU or tracking…', source: 'url-param', param: 'q' },
      },
      history: {
        savedViews: { storageKey: OPERATIONS_SAVED_VIEWS_KEY, paramKeys: [...JOURNEY_FILTER_KEYS] },
      },
      goals: {
        search: { placeholder: 'Filter staff or role', source: 'url-param', param: 'search' },
        controls: {
          choices: [
            {
              id: 'goal-view',
              label: 'Progress',
              param: 'goalView',
              options: [
                { value: 'behind', label: 'Below 70%' },
                { value: 'on-track', label: '70% – 99%' },
                { value: 'exceeded', label: '100%+' },
              ],
              clearParams: [],
            },
          ],
        },
      },
      staff: {
        search: { placeholder: 'Filter name or ID…', source: 'url-param', param: 'search' },
        controls: {
          choices: [
            {
              id: 'staff-view',
              label: 'Show',
              param: 'staffView',
              options: [
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
                { value: 'technician', label: 'Testing' },
                { value: 'packer', label: 'Packing' },
              ],
              clearParams: [],
            },
          ],
        },
      },
      logs: {
        search: { placeholder: 'Filter action, source, entity…', source: 'url-param', param: 'search' },
        controls: {
          staff: [{ id: 'actor', param: 'actorStaffId', label: 'Actor' }],
          choices: [
            {
              id: 'log-kind',
              label: 'Log',
              param: 'logKind',
              options: [
                { value: 'audit', label: 'Audit' },
                { value: 'sal', label: 'Station activity' },
              ],
              clearParams: [],
            },
          ],
        },
      },
    },
  },
  reports: {
    search: { placeholder: 'Find in this report…', source: 'url-param', param: 'q' },
    controls: {
      dates: [{ id: 'report-day', label: 'Report day', param: 'date', clearParams: [] }],
      staff: [{ id: 'staff', label: 'Staff', param: 'staffId' }],
    },
    actionsPlacement: 'sidebar',
    actions: [
      { action: { id: 'reports.refresh', label: 'Refresh', intent: 'reports:refresh' } },
      { action: { id: 'reports.export-packing', label: 'Export packing CSV', intent: 'reports:export-packing' } },
      { action: { id: 'reports.export-inbound', label: 'Export inbound CSV', intent: 'reports:export-inbound' } },
      { action: { id: 'reports.export-outbound', label: 'Export outbound CSV', intent: 'reports:export-outbound' } },
    ],
  },
  home: {
    // The house two-tier sidebar (owner 2026-09-29): `G` + letter picks the
    // parent (mode card), bare 1–3 the saved views under it. Whose work
    // (Mine · Handed off · Everyone) and Open · Done · All live in the middle
    // of the page for triage (`TaskBulkBar`), not here.
    modes: { label: 'Task list' },
    viewKeys: true,
    // Tasks' Find is the header's page search (bare F): narrows the board on `?q=`.
    search: { placeholder: 'Find a task, order #, tracking #, ticket or person…', source: 'url-param', param: 'q' },
    // `C` is create app-wide; the board claims it for New task (`registerPageCreate`), N too.
    actions: [{ action: { id: 'daily.add-task', label: 'New task', intent: 'daily:compose', hotkey: 'c' } }],
  },
  // Sales station actions plus the URL-owned Find for each searchable view.
  sales: {
    viewKeys: true,
    actions: [
      { action: { id: 'walk-in.new-sale', label: 'New sale', href: walkInStationHref('sales') } },
      { action: { id: 'walk-in.local-pickup', label: 'Local pickup', href: walkInStationHref('pickup') } },
      {
        action: { id: 'walk-in.repair-intake', label: 'Repair intake', href: walkInStationHref('repair', { new: 'true' }) },
      },
    ],
    items: {
      counter: { actions: [] },
      sales: { search: { placeholder: 'Search sales…', source: 'url-param', param: 'sq' } },
      'repairs-all': {
        actions: [],
        search: { placeholder: 'Filter repairs…', source: 'url-param', param: 'search' },
        savedViews: REPAIR_VIEWS,
        controls: REPAIR_CONTROLS,
      },
      'repairs-shipped-in': {
        actions: [],
        search: { placeholder: 'Filter repairs…', source: 'url-param', param: 'search' },
        savedViews: REPAIR_VIEWS,
        controls: REPAIR_CONTROLS,
      },
      'repairs-dropped-off': {
        actions: [],
        search: { placeholder: 'Filter repairs…', source: 'url-param', param: 'search' },
        savedViews: REPAIR_VIEWS,
        controls: REPAIR_CONTROLS,
      },
    },
  },
  // ── Scan Stations ───────────────────────────────────────────────────────
  triage: {
    search: { placeholder: 'Filter scanned cartons…', source: 'url-param', param: 'triq' },
    scanInput: { grammar: 'arrival', endpoint: '/api/receiving/lookup-po' },
  },
  receive: {
    search: { placeholder: 'Filter cartons or incoming…', source: 'url-param', param: INBOUND_FIND_PARAM },
    scanInput: { grammar: 'unbox', endpoint: '/api/receiving/lookup-po' },
    actions: [
      { action: { id: 'unbox.resume', label: 'Unbox', intent: 'unbox:resume' } },
      { action: { id: 'unbox.check', label: 'Check', intent: 'unbox:check-unreceived' } },
      { action: { id: 'unbox.add-po', label: 'Add purchase order', intent: 'receiving-composer:purchase' } },
    ],
  },
  pickup: {
    search: { placeholder: 'Order, seller, SKU or item…', source: 'url-param', param: 'q' },
    controls: {
      sort: {
        param: 'sort',
        defaultValue: 'actionable',
        options: [
          { value: 'actionable', label: 'Next action, oldest first' },
          { value: 'newest', label: 'Pickup date, newest' },
          { value: 'oldest', label: 'Pickup date, oldest' },
          { value: 'order', label: 'Order number, A to Z' },
          { value: 'customer', label: 'Seller, A to Z' },
          { value: 'amount_high', label: 'Amount, high to low' },
          { value: 'amount_low', label: 'Amount, low to high' },
        ],
      },
      dateRanges: [{
        id: 'pickup-date',
        label: 'Pickup date',
        fromParam: 'pickupFrom',
        toParam: 'pickupTo',
        clearParams: ['lcpu'],
        placeholder: 'Any pickup date',
      }],
    },
    // Resolved client-side over the cached rail; the hit writes `?lcpu=`.
    scanInput: { grammar: 'pickup', endpoint: '/api/local-pickup-orders/lines' },
  },
  // Receiving mode: All · Shipped in · Dropped off on bare 1 · 2 · 3 (no repair surface binds a bare digit).
  repair: {
    viewKeys: true,
    search: { placeholder: 'Filter repairs…', source: 'url-param', param: 'search' },
    savedViews: REPAIR_VIEWS,
    controls: REPAIR_CONTROLS,
  },
  'stations-live': {
    controls: {
      staff: [{ id: 'staff', param: 'staff', label: 'Staff' }],
      dateRanges: [{
        id: 'activity-window',
        label: 'Activity date',
        fromParam: 'from',
        toParam: 'to',
        clearParams: [],
        placeholder: 'All time',
      }],
      sort: {
        param: 'sort',
        defaultValue: 'newest',
        options: [
          { value: 'newest', label: 'Newest first' },
          { value: 'oldest', label: 'Oldest first' },
        ],
      },
    },
  },
  testing: {
    search: { placeholder: 'Filter tests…', source: 'url-param', param: 'search' },
    scanInput: { grammar: 'testing', endpoint: '/api/receiving-lines' },
  },
  'ready-to-pack': {
    search: { placeholder: 'Filter tested units…', source: 'url-param', param: 'q' },
    scanInput: { grammar: 'station', endpoint: '/api/picking/desk/scan' },
  },
  packer: {
    scanInput: { grammar: 'pack', endpoint: '/api/packing-logs' },
  },
  'scan-out': {
    scanInput: { grammar: 'scan-out', endpoint: '/api/shipped/scan-out' },
  },
  // Restores the FNSKU field the live `/shipping/fba` route lost (PARITY §fba).
  fba: {
    viewKeys: true,
    scanInput: { grammar: 'fnsku', endpoint: '/api/fba/fnskus/validate' },
  },
  // Labels & docs: Uploads (bare — one card per uploaded PDF) · Labels ·
  // Paperwork · Printed are sidebar views (bare keys 1 · 2 · 3 · 4); Find
  // narrows the list through the desk store. The header split CTA's face is
  // the view's own job — Uploads uploads label PDFs, a print view prints all of
  // its stock (⌘P); ⌘O uploads label PDFs everywhere (`LabelsDocsDesk`
  // registers the intents). Uploads filters by upload date (`?from=`/`?to=`).
  'label-intake': {
    viewKeys: true,
    search: { placeholder: 'Search labels', source: 'desk-store' },
    actions: labelsDocsActions('uploads'),
    items: {
      uploads: {
        search: { placeholder: 'Search uploads', source: 'desk-store' },
        controls: {
          dateRanges: [
            { id: 'uploaded', label: 'Uploaded', fromParam: 'from', toParam: 'to', clearParams: [], placeholder: 'Any date' },
          ],
        },
      },
      labels: { actions: labelsDocsActions('labels') },
      paperwork: { actions: labelsDocsActions('paperwork') },
      printed: { actions: labelsDocsActions('printed') },
    },
  },
  // The import record: Runs (bare) · Orders (`?view=rows`). Find narrows the
  // list server-side through `?q=` (order number, tracking, run id, sheet tab).
  imports: {
    search: { placeholder: 'Order, tracking, run or sheet tab…', source: 'url-param', param: 'q' },
    items: {
      runs: { controls: IMPORT_RUNS_CONTROLS },
      rows: { controls: IMPORT_ROWS_CONTROLS },
    },
  },
  // The Exceptions hub (owner 2026-09-28): Fulfillment · Inventory ·
  // Receiving are its MODES — the mode card the Fulfillment lane wears
  // (`FBM ▾`). Never an "all" list (owner 2026-09-29): `/exceptions` always
  // lands on one kind, and a mode opens its first kind. `G` then F / I / R
  // (`NAV_PAGE_GO_KEYS`), each with its count (facet contexts
  // `exceptions.<domain>`). In a domain its kinds are the views under the
  // card (`1`–`3`, counts `exceptions.<kind>`). No bare digit is bound on the
  // desk or its record pane. Find narrows the list server-side through `?q=`.
  exceptions: {
    modes: { label: 'Domain' },
    viewKeys: true,
    search: { placeholder: 'Order, SKU, PO, tracking or bin…', source: 'url-param', param: 'q' },
  },
  // Automations › Studio (the canvas): its old rail (`StudioSidebarPanel`)
  // was the lens · zoom menu over the library. Lens and zoom are choices here
  // (unset = Build · L1, as the canvas reads them); a zoom change drops the
  // focused node, as the menu did. The library (node palette · templates ·
  // issues) is a stage pane beside the canvas; `Library` shows or hides it
  // (`StudioShell` owns the intent).
  studio: {
    items: {
      graph: {
        controls: {
          choices: [
            {
              id: 'lens',
              label: 'Lens',
              param: 'lens',
              options: [
                { value: 'procedure', label: 'Procedure' },
                { value: 'static', label: 'Static' },
                { value: 'live', label: 'Live' },
                { value: 'flow', label: 'Flow²' },
                { value: 'people', label: 'People' },
                { value: 'gaps', label: 'Gaps' },
              ],
              clearParams: [],
            },
            {
              id: 'zoom',
              label: 'Zoom',
              param: 'z',
              options: [
                { value: '0', label: 'L0 · Business map' },
                { value: '2', label: 'L2 · Station' },
              ],
              clearParams: ['focus'],
            },
          ],
        },
        actionsPlacement: 'sidebar',
        actions: [{ action: { id: 'studio.library', label: 'Library', intent: 'studio:library' } }],
      },
    },
  },
};
