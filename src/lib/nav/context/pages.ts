/**
 * Per-page sidebar surfaces — what the old context panel / desk chrome hosted
 * beside the tab row: the page search box, a recents list, a station scan
 * input, saved views and page-level verbs. `resolveNavContext` stamps the
 * active page's (and active view's) declaration onto the `NavContext`.
 *
 * Pure data. Every entry cites the old UI it replaces (PARITY.md rows); the
 * parity gate (`parity.ts`) is what proves the declaration is complete.
 */

import { outboundSavedViewsConfig } from '@/components/unshipped/outbound-sidebar-shared';
import { walkInStationHref } from '@/lib/walk-in/jobs';
import type { NavRecentSurfaceId } from '@/lib/nav/recents/surfaces';
import type { NavAction, NavControls, NavSearch } from './schema';
import { RECON_PARAM, REF_IN_PARAM } from '@/lib/receiving/reconcile';
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
import { HISTORY_ACTIVITY_OPTIONS } from '@/lib/receiving/receiving-modes';
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
  STOCK_STATE_OPTIONS,
} from '@/lib/inventory/inventory-nav-choices';

/** A page-level verb plus the permission its door needs (never on the wire). */
export interface NavActionDecl {
  action: NavAction;
  requires?: string;
}

/** A page search box — the list it narrows reads `param` (url-param) or the desk store. */
export type NavSearchDecl = Omit<NavSearch, 'scope'>;

export interface NavSurfaceDecl {
  search?: NavSearchDecl;
  recents?: NavRecentSurfaceId;
  scanInput?: { grammar: NavScanGrammar; endpoint: string };
  savedViews?: { storageKey: string; paramKeys: readonly string[] };
  actions?: readonly NavActionDecl[];
  /** Non-facet view filters (staff picker, date range) the view's list reads. */
  controls?: NavControls;
}

export interface NavPageDecl extends NavSurfaceDecl {
  /** Overrides for one section item (child / desk view id); item fields win. */
  items?: Readonly<Record<string, NavSurfaceDecl>>;
  /**
   * The page has no views: its `recents` list IS its panel (Chat's threads).
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
 * Inbound › Unboxed (`/incoming?lane=docked`). Staff: `?staff=` — who received,
 * unboxed or scanned the carton (`build-sql.ts` staff clause). Activity: the
 * server's history axis (`?sort=` `unboxed_newest` | `scanned_newest`) —
 * which stamp orders the list, bands its days and bounds the date row; unset
 * = Unboxed. Date: the activity window over the loaded history
 * (`?dateFrom=`/`?dateTo=`), formerly the toolbar week pill (`?weekOffset=`,
 * which picking a range clears); unset = all time. The attention cut
 * (`?dflag=` Claim · Short · Unfound) has ONE control, the pills above the
 * list (they write it; a saved view keeps it) — so no sidebar row. Kind:
 * what intake it was (`?dkind=`, `dockedIntakeKind`). Sort: the ledger's column order (`useUrlColumnSort`,
 * `?colsort=`/`?coldir=`), formerly its toolbar Sort menu; unset = latest
 * activity first.
 */
const DOCKED_CONTROLS: NavControls = {
  staff: [{ id: 'handled-by', param: STAFF_FILTER_PARAM, label: 'Handled by' }],
  dateRanges: [
    {
      id: 'activity',
      label: 'Activity date',
      fromParam: DOCKED_DATE_FROM_PARAM,
      toParam: DOCKED_DATE_TO_PARAM,
      clearParams: [WEEK_OFFSET_PARAM],
      placeholder: 'All time',
    },
  ],
  choices: [
    { id: 'activity-axis', label: 'Activity', param: 'sort', options: [...HISTORY_ACTIVITY_OPTIONS], clearParams: [] },
    { id: 'kind', label: 'Kind', param: DOCKED_KIND_PARAM, options: [...DOCKED_KIND_OPTIONS], clearParams: [] },
  ],
  sort: {
    param: GRID_COLUMN_SORT_PARAM,
    dirParam: GRID_COLUMN_DIR_PARAM,
    defaultValue: 'date',
    options: [
      { value: 'date', label: 'Latest activity first' },
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
 * Inbound On the way (`/incoming`), formerly its ledger toolbar. Source: the
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
 * Shipping's queue lists (To ship · Pick list · PO paired). Staff roles: the
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
      label: 'Shipped',
      fromParam: 'dateFrom',
      toParam: 'dateTo',
      clearParams: ['shippedWeekOffset', 'allDates'],
      placeholder: 'This week',
      fromTimeParam: 'timeFrom',
      toTimeParam: 'timeTo',
    },
  ],
};

/** The To-ship desk header (OrdersDeskAddAction · Past imports · Labels walk), removed 2026-09-26. */
const TO_SHIP_ACTIONS: readonly NavActionDecl[] = [
  { action: { id: 'orders.sync', label: 'Sync ShipStation', intent: 'orders-intake:sync' } },
  { action: { id: 'orders.sync-platforms', label: 'Sync a platform…', intent: 'orders-intake:platforms' } },
  {
    action: { id: 'orders.upload-csv', label: 'Upload orders CSV', intent: 'orders-intake:file' },
    requires: 'orders.import',
  },
  { action: { id: 'orders.export-csv', label: 'Export to CSV', intent: 'desk-export:csv' } },
  { action: { id: 'orders.add', label: 'New sales order', href: '/orders/new' } },
  { action: { id: 'orders.add-test', label: 'Add test order', intent: 'orders-intake:test' } },
  { action: { id: 'orders.demo-sync', label: 'Demo sync (sample data)', intent: 'orders-intake:demo' } },
  { action: { id: 'orders.past-imports', label: 'Past imports', intent: 'orders:past-imports' } },
  { action: { id: 'orders.labels', label: 'Labels', intent: 'orders:labels-walk' } },
];

/**
 * The Labels & docs header split CTA (handoff print-stations §3.2): three bulk
 * prints by stock, then the two bulk uploads. A print view's face is its own
 * stock and carries ⌘P (the desk binds ⌘P to "print all of this view's
 * stock"); Printed has no stock of its own, so no verb there wears ⌘P.
 */
function labelsDocsActions(view: 'labels' | 'paperwork' | 'printed'): readonly NavActionDecl[] {
  const printKey = (stock: 'labels' | 'paperwork') => (view === stock ? { hotkey: 'mod+p' } : {});
  const printLabels: NavAction = { id: 'labels-docs.print-labels', label: 'Print all labels', intent: 'labels-docs:print-labels', ...printKey('labels') };
  const printPaperwork: NavAction = { id: 'labels-docs.print-paperwork', label: 'Print all paperwork', intent: 'labels-docs:print-paperwork', ...printKey('paperwork') };
  const printAll: NavAction = { id: 'labels-docs.print-all', label: 'Print all (labels + paperwork)', intent: 'labels-docs:print-all' };
  const upload: NavAction = { id: 'labels-docs.upload', label: 'Upload label PDFs', intent: 'labels-docs:upload', hotkey: 'mod+o' };
  const uploadSlips: NavAction = { id: 'labels-docs.upload-slips', label: 'Upload packing slips', intent: 'labels-docs:upload-slips' };
  const order = view === 'paperwork'
    ? [printPaperwork, printLabels, printAll, uploadSlips, upload]
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
  outbound: {
    viewKeys: true,
    items: {
      po: { savedViews: UNSHIPPED_VIEWS, controls: QUEUE_CONTROLS },
      pick: { savedViews: UNSHIPPED_VIEWS, actions: TO_SHIP_ACTIONS, controls: QUEUE_CONTROLS },
      triage: { savedViews: UNSHIPPED_VIEWS, actions: TO_SHIP_ACTIONS, controls: QUEUE_CONTROLS },
      shipped: { savedViews: SHIPPED_VIEWS, controls: SHIPPED_CONTROLS },
    },
  },
  // Header split action `IncomingDeskAddAction` — the Global Add inbound leaves.
  // Find narrows the ledger in place through `?find=` (`INBOUND_FIND_PARAM`;
  // the ledger toolbar's old "Filter incoming…" field), so a reload, a shared
  // link and a saved view keep it; the card faces open an exact hit
  // (`receiptExactFind` / `cartonExactFind`).
  // On the way also takes a pasted vendor list, located per number by
  // `GET /api/nav/locate` (the inbound locator).
  // `viewKeys`: 1 On the way · 2 Unboxed. No bare digit is bound on /incoming
  // (the status chips are ⌥1–⌥N, `segment-chords.ts`; no EvidenceDecisionBar).
  incoming: {
    viewKeys: true,
    items: {
      pipeline: {
        search: {
          placeholder: 'Search deliveries',
          source: 'url-param',
          param: INBOUND_FIND_PARAM,
          locate: { locator: 'inbound', param: REF_IN_PARAM, statusParam: RECON_PARAM },
        },
        savedViews: PIPELINE_VIEWS,
        controls: PIPELINE_CONTROLS,
      },
      docked: {
        search: { placeholder: 'Search unboxed', source: 'url-param', param: INBOUND_FIND_PARAM },
        savedViews: DOCKED_VIEWS,
        controls: DOCKED_CONTROLS,
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
    search: { placeholder: 'Search manuals', source: 'url-param', param: 'q' },
    items: {
      labels: {
        search: { placeholder: 'Search the catalog', source: 'url-param', param: 'q' },
        recents: 'labels.prints',
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
  // digits bind 1–5. Their filters moved out of the stage: Stock's find box
  // and state segment, Replenish's lost rail controls (`rtab`/`rsku`/`rstatus`,
  // stripped by hygiene since the rail left on 2026-09-15), and the Locations
  // tool dropdown. Stock's Rooms stay in the stage: a per-tenant facet with
  // counts, which `choices` (fixed vocabulary, no counts) cannot carry. Ledger
  // reads no `q` — its face is ⌘K.
  inventory: {
    viewKeys: true,
    items: {
      stock: {
        search: { placeholder: 'Title, SKU, location, room or qty…', source: 'url-param', param: 'q' },
        controls: {
          choices: [{ id: 'status', label: 'State', param: 'status', options: [...STOCK_STATE_OPTIONS], clearParams: ['open', 'sku'] }],
        },
      },
      'sku-exceptions': {
        search: { placeholder: 'Title, SKU, location, room or qty…', source: 'url-param', param: 'q' },
        controls: {
          choices: [{ id: 'status', label: 'State', param: 'status', options: [...STOCK_STATE_OPTIONS], clearParams: ['open', 'sku'] }],
        },
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
  support: {
    items: { tickets: { recents: 'support.tickets' } },
  },
  reports: {
    actions: [{ action: { id: 'reports.refresh', label: 'Refresh', intent: 'reports:refresh' } }],
  },
  home: {
    actions: [{ action: { id: 'daily.add-task', label: 'Add task', intent: 'daily:compose' } }],
  },
  // `WalkInHistorySidebar` station links (Sales Board + Local Pickup views).
  sales: {
    actions: [
      { action: { id: 'walk-in.new-sale', label: 'New sale', href: walkInStationHref('sales') } },
      { action: { id: 'walk-in.local-pickup', label: 'Local pickup', href: walkInStationHref('pickup') } },
      {
        action: { id: 'walk-in.repair-intake', label: 'Repair intake', href: walkInStationHref('repair', { new: 'true' }) },
      },
    ],
    items: { counter: { actions: [] }, repairs: { actions: [] } },
  },
  // ── Scan Stations ───────────────────────────────────────────────────────
  triage: {
    recents: 'receiving.scanned',
    scanInput: { grammar: 'arrival', endpoint: '/api/receiving/lookup-po' },
  },
  receive: {
    recents: 'receiving.unbox_opened',
    scanInput: { grammar: 'unbox', endpoint: '/api/receiving/lookup-po' },
    actions: [
      { action: { id: 'unbox.resume', label: 'Unbox', intent: 'unbox:resume' } },
      { action: { id: 'unbox.check', label: 'Check', intent: 'unbox:check-unreceived' } },
      { action: { id: 'unbox.add-po', label: 'Add purchase order', intent: 'receiving-composer:purchase' } },
    ],
  },
  pickup: {
    recents: 'pickup.orders',
    // Resolved client-side over the cached rail; the hit writes `?lcpu=`.
    scanInput: { grammar: 'pickup', endpoint: '/api/local-pickup-orders/lines' },
  },
  testing: {
    recents: 'testing.opened',
    scanInput: { grammar: 'testing', endpoint: '/api/receiving-lines' },
  },
  'ready-to-pack': {
    recents: 'tech.scans',
    scanInput: { grammar: 'station', endpoint: '/api/picking/desk/scan' },
  },
  packer: {
    recents: 'packer.packs',
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
  // Labels & docs: Labels · Paperwork · Printed are sidebar views, one per
  // print job (bare keys 1 · 2 · 3); Find narrows the queue through the desk
  // store. The header split CTA's face is the view's own stock — ⌘P prints
  // all of it, ⌘O uploads label PDFs (`LabelsDocsDesk` registers the intents).
  'label-intake': {
    viewKeys: true,
    search: { placeholder: 'Search labels', source: 'desk-store' },
    actions: labelsDocsActions('labels'),
    items: {
      labels: {},
      paperwork: { actions: labelsDocsActions('paperwork') },
      printed: { actions: labelsDocsActions('printed') },
    },
  },
};
