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
import { PRINT_STATION_CONDITION_OPTIONS, PRINT_STATION_CONDITION_PARAM } from '@/lib/print-station/fnsku';
import type { NavRecentSurfaceId } from '@/lib/nav/recents/surfaces';
import { ORDER_DATE_LABEL } from '@/lib/orders/order-dates';
import { inboundOrderFormHref } from '@/lib/inbound/inbound-order-compose';
import { LOCATION_STOCK_SORT_OPTIONS } from '@/lib/inventory/location-stock-row';
import { RECEIVING_PATHS } from '@/lib/nav/route-tree';
import {
  RECORDS_AXES,
  RECORDS_AXIS_LABEL,
  RECORDS_AXIS_PARAM,
  RECORDS_DEFAULT_AXIS,
  RECORDS_DEFAULT_GRAIN,
  RECORDS_DEFAULT_WINDOW_LABEL,
  RECORDS_DIR_PARAM,
  RECORDS_EVENTS,
  RECORDS_EVENT_BY_PARAM,
  RECORDS_EVENT_FROM_PARAM,
  RECORDS_EVENT_LABEL,
  RECORDS_EVENT_PARAM,
  RECORDS_EVENT_TO_PARAM,
  RECORDS_FIND_PARAM,
  RECORDS_FROM_PARAM,
  RECORDS_REFS_PARAM,
  RECORDS_GRAINS,
  RECORDS_GRAIN_LABEL,
  RECORDS_GRAIN_PARAM,
  RECORDS_JOURNEY_SORTS,
  RECORDS_SORTS,
  RECORDS_SORT_DIR,
  RECORDS_SORT_LABEL,
  RECORDS_SORT_PARAM,
  RECORDS_TO_PARAM,
} from '@/lib/nav/records/params';
import type { NavAction, NavControls, NavSearch } from './schema';
import {
  TASK_BOARD_GROUP_BYS,
  TASK_BOARD_GROUP_BY_LABEL,
  TASK_BOARD_SORTS,
  TASK_BOARD_SORT_LABEL,
} from '@/lib/task-board/task-board-model';
import { INBOUND_LOCATE } from '@/lib/nav/locate/inbound-params';
import { FULFILLED_VIEW_BUCKET_IDS } from '@/lib/nav/locate/bucket-precedence';
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
  PURCHASES_AXES,
  PURCHASES_AXIS_LABEL,
  PURCHASES_AXIS_PARAM,
  PURCHASES_DEFAULT_AXIS,
  PURCHASES_DEFAULT_SORT,
  PURCHASES_DEFAULT_WINDOW_LABEL,
  PURCHASES_DIR_PARAM,
  PURCHASES_FROM_PARAM,
  PURCHASES_SORT_PARAM,
  PURCHASES_TO_PARAM,
  PURCHASES_UNBOXED_BY_PARAM,
} from '@/lib/receiving/purchases-params';
import {
  FULFILLED_AXES,
  FULFILLED_AXIS_LABEL,
  FULFILLED_AXIS_PARAM,
  FULFILLED_DEFAULT_AXIS,
  FULFILLED_DEFAULT_GRAIN,
  FULFILLED_DEFAULT_SORT,
  FULFILLED_DEFAULT_WINDOW_LABEL,
  FULFILLED_DIR_PARAM,
  FULFILLED_DONE_PARAM,
  FULFILLED_FIND_PARAM,
  FULFILLED_FROM_PARAM,
  FULFILLED_GRAIN_PARAM,
  FULFILLED_GROUP_PARAM,
  FULFILLED_MINE_PARAM,
  FULFILLED_MINE_VALUE,
  FULFILLED_PACKER_PARAM,
  FULFILLED_SORTS,
  FULFILLED_SORT_PARAM,
  FULFILLED_TO_PARAM,
  FULFILLED_ZOOM_SORT,
} from '@/lib/outbound/fulfilled-params';
import {
  SOURCING_ALERT_STATUS_OPTIONS,
  SOURCING_SCOUT_BY_OPTIONS,
  SOURCING_SUPPLIER_TYPE_OPTIONS,
  SOURCING_WATCH_STATUS_OPTIONS,
} from '@/components/sourcing/sourcing-shared';
import { SHEET_SAVED_VIEW_CONFIG } from '@/lib/saved-views/surfaces';
import { JOURNEY_FILTER_KEYS, OPERATIONS_SAVED_VIEWS_KEY } from '@/lib/operations/saved-view-presets';
import { DEFAULT_REPAIR_SORT, REPAIR_SORT_OPTIONS, REPAIR_SORT_PARAM } from '@/lib/repair/repair-sort';
import { REPAIR_STATUS_CHIP_PARAM } from '@/lib/repair/repair-status-chips';
import { LIFECYCLE } from '@/design-system/tokens/lifecycle';
import { QUEUE_STATUS_CHIPS } from '@/lib/orders/to-ship-queue';
import { SUPPORT_LOCATE } from '@/lib/nav/locate/support-params';
import { CHANNEL_DISPOSITION_LABELS } from '@/lib/channel-allocation/types';
import {
  ORDER_PACKET_SORT_LABEL,
  ORDER_PACKET_SORT_PARAM,
  ORDER_PACKET_SORTS,
  ORDER_PACKET_QUERY_PARAM,
} from '@/lib/label-prints/order-packet-contracts';
import {
  PRINT_FILE_PRINTED_FROM_PARAM,
  PRINT_FILE_PRINTED_TO_PARAM,
  PRINT_FILE_QUERY_PARAM,
  PRINT_FILE_SORT_LABEL,
  PRINT_FILE_SORT_PARAM,
  PRINT_FILE_SORTS,
  PRINT_FILE_UPLOADED_FROM_PARAM,
  PRINT_FILE_UPLOADED_TO_PARAM,
} from '@/lib/label-prints/print-file-contracts';
import {
  SUPPORT_LIST_DEFAULT_GROUP,
  SUPPORT_LIST_DEFAULT_SORT,
  SUPPORT_LIST_GROUPS,
  SUPPORT_LIST_GROUP_LABEL,
  SUPPORT_LIST_SORTS,
  SUPPORT_LIST_SORT_LABEL,
} from '@/lib/support/list/support-list';
import { RECEIVING_PHOTO_STAGES } from '@/lib/receiving/photo-intent';
import { photoStageLabel } from '@/lib/photos/stages';
import { MEDIA_SAVED_VIEWS_KEY, PHOTO_LIBRARY_SAVED_VIEW_PARAM_KEYS } from '@/lib/photos/library-filter-state';

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
  // A pasted list's statuses (`?recon=`) and reasons (`?recon_reason=`) are the
  // ledger body's chips over its list (operator 2026-10-04), never a sidebar row.
};

const PURCHASES_VIEWS = {
  storageKey: SAVED_VIEW_STORAGE_KEY.receiving_purchases,
  paramKeys: SAVED_VIEW_PARAM_KEYS.receiving_purchases,
};

/**
 * Purchasing (`/purchasing`, a Receiving mode; `purchases-params.ts`):
 * every purchase-order line in a window on one date axis (ordered · delivered
 * · unboxed; neither end set = the last 90 days), by who unboxed it, in a
 * column order. Source and Vendor are counted facets
 * (`NAV_FACET_GROUPS.purchasing`). The status chips (`?recon=`)
 * are the sheet's own pasted-list row in the body, never a sidebar row.
 */
const PURCHASES_CONTROLS: NavControls = {
  choices: [
    {
      id: 'axis',
      label: 'Date',
      param: PURCHASES_AXIS_PARAM,
      options: PURCHASES_AXES.map((value) => ({ value, label: PURCHASES_AXIS_LABEL[value] })),
      defaultValue: PURCHASES_DEFAULT_AXIS,
      clearParams: [],
    },
  ],
  dateRanges: [
    {
      id: 'window',
      label: 'Window',
      fromParam: PURCHASES_FROM_PARAM,
      toParam: PURCHASES_TO_PARAM,
      clearParams: [],
      placeholder: PURCHASES_DEFAULT_WINDOW_LABEL,
    },
  ],
  staff: [{ id: 'unboxed-by', param: PURCHASES_UNBOXED_BY_PARAM, label: 'Unboxed by' }],
  sort: {
    param: PURCHASES_SORT_PARAM,
    dirParam: PURCHASES_DIR_PARAM,
    defaultValue: PURCHASES_DEFAULT_SORT,
    options: [
      { value: 'ordered', label: 'Ordered, newest first' },
      { value: 'imported', label: 'Imported, newest first', dir: 'desc' },
      { value: 'delivered', label: 'Delivered, newest first', dir: 'desc' },
      { value: 'unboxed', label: 'Unboxed, newest first', dir: 'desc' },
      { value: 'waiting', label: 'Delivered longest, not received', dir: 'asc' },
      { value: 'po', label: 'Purchase order, A to Z', dir: 'asc' },
      { value: 'vendor', label: 'Vendor, A to Z', dir: 'asc' },
      { value: 'product', label: 'Product, A to Z', dir: 'asc' },
      { value: 'status', label: 'Status', dir: 'asc' },
      { value: 'units', label: 'Most units first', dir: 'desc' },
    ],
  },
};

/**
 * FBM's queue list (Allocate). Staff roles: the
 * universal `?staff=` assignee filter (`STAFF_FILTER_PARAM`, `sqlOrderAssignedToStaff`)
 * and `?pickedBy=` / `?packedBy=` — who ACTUALLY picked (the picked-by resolver, `src/lib/picking/picked-by.ts`) and
 * packed (`order_stage_facts.packed_by`), plus the pick assignee (`?pickerId=`). Dates: order date and ship-by
 * (PT civil days). Sort: the queue's own `?sort=`/`?dir=` alphabet
 * (`queue-display-sort.ts`), ship-by soonest first by default — every view
 * and column order the list header's retired ⇅ menu offered (2026-09-27);
 * platform / carrier name pins stay out (filters in disguise).
 */
const QUEUE_CONTROLS: NavControls = {
  staff: [
    { id: 'assigned', param: 'staff', label: 'Assigned' },
    { id: 'picked-by', param: 'pickedBy', label: 'Picked by' },
    { id: 'packer', param: 'packedBy', label: 'Packed by' },
    { id: 'picker', param: 'pickerId', label: 'Picker' },
  ],
  dateRanges: [
    { id: 'ship-by', label: 'Ship-by date', fromParam: 'shipByFrom', toParam: 'shipByTo', clearParams: [], placeholder: 'Any day' },
    { id: 'ordered', label: ORDER_DATE_LABEL.placed, fromParam: 'orderFrom', toParam: 'orderTo', clearParams: [], placeholder: 'Any day' },
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
 * the Stage facet (`?repairStatus=`, `src/lib/nav/facets/repair.ts`) narrows within it. Channel is the view
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

const FULFILLED_VIEWS = {
  storageKey: SAVED_VIEW_STORAGE_KEY.outbound_fulfilled,
  paramKeys: SAVED_VIEW_PARAM_KEYS.outbound_fulfilled,
};

/**
 * Fulfilled (`/fulfilled`; `fulfilled-params.ts`): every shipped order in a
 * window on one date axis (shipped · delivered · placed · ship-by; neither
 * end set = the last 90 days), by who packed it. Its views are the board and
 * one per off-board bucket (`?col=`, the sidebar children); Journey,
 * Platform, Carrier and Scan source are counted facets on every view
 * (`NAV_FACET_GROUPS['fulfilled.<view>']`). Sort, the grain, the axis, the
 * platform and the carrier are the Records params and words — the body is
 * the Records sheet. Packed by me (`mine=me`) narrows server-side as the
 * viewer's own `packer` (`fulfilledApiParams`), so counts agree. The
 * board's display rows — Done columns, Group by carrier (operator
 * 2026-10-06) — are defaulted choices / the group row the board reads
 * client-side.
 */
const FULFILLED_SORT_CONTROL = {
  param: FULFILLED_SORT_PARAM,
  dirParam: FULFILLED_DIR_PARAM,
  defaultValue: FULFILLED_DEFAULT_SORT,
  options: FULFILLED_SORTS.map((value) => ({ value, label: RECORDS_SORT_LABEL[value], dir: RECORDS_SORT_DIR[value] })),
};
const FULFILLED_GRAIN_CHOICE = {
  id: 'grain',
  label: 'Grain',
  param: FULFILLED_GRAIN_PARAM,
  options: RECORDS_GRAINS.map((value) => ({ value, label: RECORDS_GRAIN_LABEL[value] })),
  defaultValue: FULFILLED_DEFAULT_GRAIN,
  clearParams: [],
};
const FULFILLED_CONTROLS: NavControls = {
  choices: [
    FULFILLED_GRAIN_CHOICE,
    {
      id: 'axis',
      label: 'Date',
      param: FULFILLED_AXIS_PARAM,
      options: FULFILLED_AXES.map((value) => ({ value, label: FULFILLED_AXIS_LABEL[value] })),
      defaultValue: FULFILLED_DEFAULT_AXIS,
      clearParams: [],
    },
    {
      id: 'mine',
      label: 'Packed by me',
      param: FULFILLED_MINE_PARAM,
      options: [
        { value: 'all', label: 'Everyone' },
        { value: FULFILLED_MINE_VALUE, label: 'Only mine' },
      ],
      defaultValue: 'all',
      // Mine and a named packer answer the same question — picking either side drops the other.
      clearParams: [FULFILLED_PACKER_PARAM],
    },
    {
      id: 'done',
      label: 'Done columns',
      param: FULFILLED_DONE_PARAM,
      options: [
        { value: 'show', label: 'Show' },
        { value: 'hide', label: 'Hide' },
      ],
      defaultValue: 'show',
      clearParams: [],
    },
  ],
  group: {
    param: FULFILLED_GROUP_PARAM,
    defaultValue: 'none',
    options: [
      { value: 'none', label: 'No grouping' },
      { value: 'carrier', label: 'Carrier' },
    ],
  },
  dateRanges: [
    {
      id: 'window',
      label: 'Window',
      fromParam: FULFILLED_FROM_PARAM,
      toParam: FULFILLED_TO_PARAM,
      clearParams: [],
      placeholder: FULFILLED_DEFAULT_WINDOW_LABEL,
    },
  ],
  staff: [{ id: 'packer', param: FULFILLED_PACKER_PARAM, label: 'Packed by' }],
  sort: FULFILLED_SORT_CONTROL,
};

/**
 * A Fulfilled VIEW (Returned, Late, … — `?col=`, operator 2026-10-06): one
 * bucket's orders on the Records sheet, worst first, so its Sort defaults to
 * Most over limit; the board's own display rows (Done columns, Group by) do
 * not apply.
 */
const FULFILLED_VIEW_CONTROLS: NavControls = {
  choices: FULFILLED_CONTROLS.choices?.filter((choice) => choice.param !== FULFILLED_DONE_PARAM),
  dateRanges: FULFILLED_CONTROLS.dateRanges,
  staff: FULFILLED_CONTROLS.staff,
  sort: { ...FULFILLED_SORT_CONTROL, defaultValue: FULFILLED_ZOOM_SORT },
};

/** The To-ship desk header (OrdersDeskAddAction · Past imports · Labels walk), removed 2026-09-26. */
const TO_SHIP_ACTIONS: readonly NavActionDecl[] = [
  // Face = the page's manual verb (owner 2026-09-28). Syncing, demo sync, test
  // orders and Labels left this menu: syncing is the global header Sync (its
  // history — past imports — is Operations › Sync); the Labels walk keeps ⌥/Alt+L.
  { action: { id: 'orders.add', label: 'Add manual order', href: '/orders/new' } },
  {
    action: { id: 'orders.upload-csv', label: 'Upload orders CSV', intent: 'orders-intake:file' },
    requires: 'orders.import',
  },
  { action: { id: 'orders.export-csv', label: 'Export to CSV', intent: 'desk-export:csv' } },
];

/**
 * The Labels & docs header split CTA. Bulk (the bare route, operator
 * 2026-10-06): the face is **Upload** (⌘O — PDFs, no type choice), then
 * **Print** (⌘P — the checked files, else the open one). Orders
 * (`?view=orders`, 2026-10-05): the face is **Print order** (⌘P — the
 * checked orders, else the open one), then **Upload** (⌘O — the open order's
 * first missing slot, typed and targeted) and **Buy label** (the desk's own
 * compose, `?buy=1`).
 */
function labelsDocsActions(view: 'uploads' | 'orders'): readonly NavActionDecl[] {
  if (view === 'uploads') {
    return [
      { action: { id: 'labels-docs.upload', label: 'Upload', intent: 'labels-docs:upload', hotkey: 'mod+o' } },
      { action: { id: 'labels-docs.print-selected', label: 'Print', intent: 'labels-docs:print-selected', hotkey: 'mod+p' } },
    ];
  }
  return [
    { action: { id: 'labels-docs.print-orders', label: 'Print order', intent: 'labels-docs:print-orders', hotkey: 'mod+p' } },
    { action: { id: 'labels-docs.upload', label: 'Upload', intent: 'labels-docs:upload', hotkey: 'mod+o' } },
    { action: { id: 'labels-docs.buy-label', label: 'Buy label', href: '/shipping/label-intake?view=orders&buy=1' } },
  ];
}

/**
 * Labels & docs › Bulk, the file list (operator 2026-10-06): Sort (Newest
 * uploaded · Oldest uploaded · Last printed — the day headers follow it),
 * then the Uploaded and Printed windows. Print status (All · Not printed ·
 * Partly printed · Printed) is a counted facet
 * (`NAV_FACET_GROUPS['label-intake.uploads']`); Find is the page's search.
 * Every change drops the page.
 */
const FILES_CONTROLS = {
  order: ['sort', 'facets', 'dateRanges'],
  sort: {
    param: PRINT_FILE_SORT_PARAM,
    defaultValue: 'newest',
    options: PRINT_FILE_SORTS.map((value) => ({ value, label: PRINT_FILE_SORT_LABEL[value] })),
  },
  dateRanges: [
    { id: 'uploaded', label: 'Uploaded', fromParam: PRINT_FILE_UPLOADED_FROM_PARAM, toParam: PRINT_FILE_UPLOADED_TO_PARAM, clearParams: ['page'], placeholder: 'Any date' },
    { id: 'printed', label: 'Printed', fromParam: PRINT_FILE_PRINTED_FROM_PARAM, toParam: PRINT_FILE_PRINTED_TO_PARAM, clearParams: ['page'], placeholder: 'Any date' },
  ],
} satisfies NavControls;

/**
 * Labels & docs › Orders (2026-10-05): Sort only — Status (Missing · Ready ·
 * Printed · All), Missing slot and Channel are counted facets
 * (`NAV_FACET_GROUPS['label-intake.orders']`), all answered by the one
 * `/api/shipping/label-intake/orders` statement.
 */
const ORDERS_CONTROLS = {
  sort: {
    param: ORDER_PACKET_SORT_PARAM,
    defaultValue: 'priority',
    options: ORDER_PACKET_SORTS.map((value) => ({ value, label: ORDER_PACKET_SORT_LABEL[value] })),
  },
} satisfies NavControls;

/**
 * Media Library selection (operator law 2026-10-04): the body's Filters menu
 * (`PhotoLibraryFilterDropdown`, retired) lives here. Every param is one
 * `parsePhotoLibraryFilters` already reads (`src/lib/photos/library-filter-state.ts`).
 * Sort paints first (operator 2026-10-08: "sorting on the left contextual side right at the top").
 */
const MEDIA_LIBRARY_CONTROLS = {
  sort: {
    param: 'sort',
    defaultValue: 'recent',
    options: [
      { value: 'recent', label: 'Newest first' },
      { value: 'oldest', label: 'Oldest first' },
    ],
  },
  staff: [{ id: 'taken-by', param: 'staffId', label: 'Taken by' }],
  dateRanges: [
    { id: 'taken', label: 'Taken', fromParam: 'dateFrom', toParam: 'dateTo', clearParams: [], placeholder: 'All dates' },
  ],
  choices: [
    {
      id: 'damage',
      label: 'Damage',
      param: 'damageDetected',
      options: [
        { value: 'true', label: 'Damage detected' },
        { value: 'false', label: 'No damage flagged' },
      ],
      clearParams: [],
    },
    {
      id: 'analysis',
      label: 'Analysis',
      param: 'hasAnalysis',
      options: [
        { value: 'true', label: 'Analyzed' },
        { value: 'false', label: 'Not analyzed' },
      ],
      clearParams: [],
    },
  ],
} satisfies NavControls;
/** Evidence stage narrows only the Unboxing view (`photoLibraryFiltersToParams` drops it elsewhere). */
const MEDIA_UNBOXING_CONTROLS: NavControls = {
  ...MEDIA_LIBRARY_CONTROLS,
  choices: [
    {
      id: 'stage',
      label: 'Evidence stage',
      param: 'stage',
      options: RECEIVING_PHOTO_STAGES.map((stage) => ({ value: stage, label: photoStageLabel(stage) })),
      clearParams: [],
    },
    ...MEDIA_LIBRARY_CONTROLS.choices,
  ],
};

/** Stock ledger order — location walk, on-hand total, or oldest cycle count. */
const STOCK_LIST_SORT = {
  param: 'sort',
  defaultValue: 'location-asc',
  options: LOCATION_STOCK_SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
};

/** FNSKU labels: one Amazon condition, `none` for a blank condition, or unset for every row. Stations has no catalog to cut. */
const FNSKU_CONDITION_CONTROLS: NavControls = {
  choices: [
    {
      id: 'condition',
      label: 'Condition',
      param: PRINT_STATION_CONDITION_PARAM,
      options: PRINT_STATION_CONDITION_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
      clearParams: ['page'],
    },
  ],
};

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
      orders: { savedViews: UNSHIPPED_VIEWS, actions: TO_SHIP_ACTIONS, controls: QUEUE_CONTROLS },
    },
  },
  // Find narrows the sheet server-side (`q`) — no locator; a pasted list is the search bar's.
  fulfilled: {
    recentsPanel: true,
    search: { placeholder: 'Find fulfilled orders', source: 'url-param', param: FULFILLED_FIND_PARAM },
    savedViews: FULFILLED_VIEWS,
    controls: FULFILLED_CONTROLS,
    items: Object.fromEntries(FULFILLED_VIEW_BUCKET_IDS.map((bucket) => [bucket, { controls: FULFILLED_VIEW_CONTROLS }])),
  },
  // Header split action `IncomingDeskAddAction` — the Global Add inbound leaves.
  // Find narrows the ledger in place through `?find=` (`INBOUND_FIND_PARAM`;
  // the ledger toolbar's old "Filter incoming…" field), so a reload, a shared
  // link and a saved view keep it; the card faces open an exact hit
  // (`receiptExactFind` / `cartonExactFind`).
  // Inbound also takes a pasted vendor list, located per number by
  // `GET /api/nav/locate` (the inbound locator).
  // `viewKeys`: 1 Inbound · 2 Docked · 3 Unboxed. No bare digit is bound on /incoming
  // (the statuses — the sidebar's Delivery status facet — are ⌥1–⌥N, `segment-chords.ts`; no EvidenceDecisionBar).
  incoming: {
    viewKeys: true,
    items: {
      pipeline: {
        search: {
          placeholder: 'Search inbound deliveries',
          source: 'url-param',
          param: INBOUND_FIND_PARAM,
          locate: { ...INBOUND_LOCATE },
        },
        savedViews: PIPELINE_VIEWS,
        controls: PIPELINE_CONTROLS,
      },
      docked: {
        search: {
          placeholder: 'Find tracking or last digits',
          source: 'url-param',
          param: INBOUND_FIND_PARAM,
          locate: { ...INBOUND_LOCATE },
        },
        savedViews: DOCKED_VIEWS,
        controls: DOCKED_CONTROLS,
      },
      unboxed: {
        search: {
          placeholder: 'Search unboxed cartons',
          source: 'url-param',
          param: INBOUND_FIND_PARAM,
          locate: { ...INBOUND_LOCATE },
        },
        savedViews: DOCKED_VIEWS,
        controls: UNBOXED_CONTROLS,
      },
    },
    actions: [
      { action: { id: 'incoming.add-po', label: 'Add purchase order', href: inboundOrderFormHref('desk') } },
      { action: { id: 'incoming.add-return', label: 'Add return', href: inboundOrderFormHref('desk', { type: 'RETURN' }) } },
      { action: { id: 'incoming.import-orders', label: 'Import orders', href: RECEIVING_PATHS.purchaseImport } },
      { action: { id: 'incoming.import-zoho', label: 'Import Zoho POs', intent: 'global-add:incoming-zoho' } },
      {
        action: { id: 'incoming.import-ebay', label: 'Import eBay purchases', intent: 'global-add:incoming-ebay' },
        requires: 'integrations.ebay',
      },
    ],
  },
  // Purchasing (Receiving mode, owner 2026-10-05): every PO line in a window.
  // View-less, but it opens its own panel (‹ Receiving, the lane's modes,
  // Find, controls, facets) — the `recentsPanel` switch, as on Local Pickup.
  // Find narrows the sheet in place — no locator, a pasted list is Inbound's.
  purchasing: {
    recentsPanel: true,
    search: { placeholder: 'Find purchases', source: 'url-param', param: INBOUND_FIND_PARAM },
    savedViews: PURCHASES_VIEWS,
    controls: PURCHASES_CONTROLS,
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
        // The two ways a product enters the catalog from the desk (ProductCatalogWorkspace binds both).
        actions: [
          { action: { id: 'catalog.add-product', label: 'Add product', intent: 'catalog:add-product' }, requires: 'sku_stock.manage' },
          { action: { id: 'catalog.import-csv', label: 'Import products CSV', intent: 'catalog:import-csv' }, requires: 'sku_stock.manage' },
        ],
      },
      manuals: { search: { placeholder: 'Search manuals', source: 'url-param', param: 'q' } },
      labels: {
        search: { placeholder: 'Search the catalog', source: 'url-param', param: 'q' },
      },
      pairing: { search: { placeholder: 'Filter SKU, title, or any platform ID…', source: 'url-param', param: 'q' } },
      qc: { search: { placeholder: 'Filter products…', source: 'url-param', param: 'q' } },
    },
  },
  // One list — all stock. Health and the Room › Aisle › Bay › Level ›
  // Position drill are the `stock.all` facets.
  stock: {
    items: {
      all: {
        search: { placeholder: 'Title, SKU, location, room or qty…', source: 'url-param', param: 'q' },
        controls: { sort: STOCK_LIST_SORT },
      },
    },
  },
  // All is the default, unfiltered dataset. Saved views are optional
  // refinements over it; the hierarchy tools are explicit sibling destinations.
  inventory: {
    viewKeys: true,
    items: {
      locations: {
        search: { placeholder: 'Location, barcode, room or aisle…', source: 'url-param', param: 'q' },
        savedViews: SHEET_SAVED_VIEW_CONFIG.bins,
        controls: {
          choices: [{
            id: 'status',
            label: 'Status',
            param: 'status',
            options: [
              { value: 'empty', label: 'Empty' },
              { value: 'low', label: 'Low stock' },
              { value: 'over', label: 'Over capacity' },
              { value: 'stale', label: 'Needs counting' },
            ],
            clearParams: ['code'],
          }],
        },
      },
      rooms: { search: { placeholder: 'Find a room…', source: 'url-param', param: 'q' } },
      racks: { search: { placeholder: 'Find a rack…', source: 'url-param', param: 'q' } },
      map: {
        controls: {
          choices: [{
            id: 'show-empty',
            label: 'Locations',
            param: 'showEmpty',
            options: [
              { value: '0', label: 'Hide empty' },
              { value: '1', label: 'Show empty' },
            ],
            clearParams: [],
          }],
        },
      },
      labels: {},
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
  // Print station (owner 2026-09-29; modes 2026-10-04; condition filter 2026-10-05): two modes on the card, `G` then a letter — FNSKU labels
  // (printing: Find is the master route to an FNSKU, narrowed on the server, an exact FNSKU opens it) and
  // Stations (managing: Find narrows the org's print stations by name).
  'print-station': {
    modes: { label: 'Printing' },
    viewKeys: true,
    search: { placeholder: 'FNSKU, ASIN, SKU or title…', source: 'url-param', param: 'q' },
    items: {
      fnsku: { controls: FNSKU_CONDITION_CONTROLS },
      'fnsku-reprinted': { controls: FNSKU_CONDITION_CONTROLS },
      'stations-all': { search: { placeholder: 'Station name or printer…', source: 'url-param', param: 'q' } },
    },
  },
  'ops-photos': {
    viewKeys: true,
    // Server-backed views (`/api/photos/saved-views`), one-click blocks at the
    // top of the sidebar body (operator 2026-10-08), not header tabs.
    savedViews: { storageKey: MEDIA_SAVED_VIEWS_KEY, paramKeys: PHOTO_LIBRARY_SAVED_VIEW_PARAM_KEYS },
    search: {
      placeholder: 'Find order, tracking, serial, SKU, ticket or text…',
      source: 'url-param',
      param: 'q',
    },
    controls: MEDIA_LIBRARY_CONTROLS,
    items: { unboxing: { controls: MEDIA_UNBOXING_CONTROLS } },
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
    items: {
      // Task time: item controls replace the page's, so day + staff repeat here.
      activity: {
        controls: {
          dates: [{ id: 'report-day', label: 'Report day', param: 'date', clearParams: [] }],
          staff: [{ id: 'staff', label: 'Staff', param: 'staffId' }],
          choices: [
            {
              id: 'record-kind',
              label: 'Record kind',
              param: 'type',
              options: [
                { value: 'task', label: 'Tasks' },
                { value: 'checklist', label: 'Checklists' },
              ],
              clearParams: [],
            },
          ],
        },
      },
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
    // parent (mode card), bare 1–3 the saved views under it. Operator law
    // 2026-10-04 (supersedes the 2026-09-29 mid-page placement): every
    // control that picks WHICH tasks show or IN WHAT ORDER lives here —
    // Status (`?filter=`, unset = Open), Whose work (`?scope=`, unset = Mine),
    // Sort (`?sort=`) and Group by (`?group=`), the last two remembered per
    // staffer and seeded into the URL on arrival (`useTaskBoard`). The body
    // keeps List · Columns, the checklist column switch and the bulk verbs.
    modes: { label: 'Task list' },
    viewKeys: true,
    // Tasks' Find is the header's page search (bare F): narrows the board on `?q=`.
    search: { placeholder: 'Find a task, order #, tracking # or person…', source: 'url-param', param: 'q' },
    // `C` is create app-wide; the board claims it for New task (`registerPageCreate`), N too.
    actions: [{ action: { id: 'daily.add-task', label: 'New task', intent: 'daily:compose', hotkey: 'c' } }],
    controls: {
      sort: {
        param: 'sort',
        defaultValue: 'urgency',
        options: TASK_BOARD_SORTS.map((value) => ({ value, label: TASK_BOARD_SORT_LABEL[value] })),
      },
      // Type on Long-term projects reads as Project (`useTaskBoard`); List · Columns ignores it (columns ARE the type split).
      group: {
        param: 'group',
        defaultValue: 'type',
        options: TASK_BOARD_GROUP_BYS.map((value) => ({ value, label: TASK_BOARD_GROUP_BY_LABEL[value] })),
      },
      choices: [
        {
          id: 'status',
          label: 'Status',
          param: 'filter',
          defaultValue: 'open',
          // Waiting = open work on a hold (Pending · Follow-up · Blocked — `TASK_HOLDS`).
          options: [
            { value: 'open', label: 'Open' },
            { value: 'waiting', label: 'Waiting' },
            { value: 'done', label: 'Done' },
            { value: 'all', label: 'All' },
          ],
          clearParams: [],
        },
        {
          id: 'scope',
          label: 'Whose work',
          param: 'scope',
          defaultValue: 'mine',
          options: [
            { value: 'mine', label: 'Mine' },
            { value: 'handed', label: 'Handed off' },
            { value: 'everyone', label: 'Everyone' },
          ],
          clearParams: [],
        },
      ],
    },
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
  customers: {
    search: { placeholder: 'Search customers…', source: 'url-param', param: 'q' },
  },
  // /support — the Support workspace (owner 2026-10-04). Find narrows the list
  // (`?q=`, SUPPORT_LIST_SQL) and its dropdown lists the matching Support
  // items (support locator: per-status pills + the records, a click opens
  // `?item=`); a pasted list rides `?refs=` / `?located=`.
  // Sort (`?sort=`, default Most urgent first) and Group by (`?group=`, unset =
  // No grouping — `controls.group`, view state like Sort: one pressed choice,
  // never counted or cleared by Reset) are the list's own params
  // (`parseSupportListFilter`); the Platform · Account · Assignee facets are
  // NAV_FACET_GROUPS['support.*'].
  // The local status row (New … Closed, `?status=`) is the record list's chip
  // cut, never a sidebar control. `viewKeys`: no other bare digit is bound on
  // /support. `C` (and N) open the inline New Support item form — the page
  // claims `C` (`registerPageCreate`) and runs `support:create`.
  support: {
    viewKeys: true,
    search: { placeholder: 'Find Support items', source: 'url-param', param: 'q', locate: { ...SUPPORT_LOCATE } },
    controls: {
      sort: {
        param: 'sort',
        defaultValue: SUPPORT_LIST_DEFAULT_SORT,
        options: SUPPORT_LIST_SORTS.map((value) => ({ value, label: SUPPORT_LIST_SORT_LABEL[value] })),
      },
      group: {
        param: 'group',
        defaultValue: SUPPORT_LIST_DEFAULT_GROUP,
        options: SUPPORT_LIST_GROUPS.map((value) => ({ value, label: SUPPORT_LIST_GROUP_LABEL[value] })),
      },
    },
    actions: [
      {
        action: { id: 'support.new-item', label: 'New Support item', intent: 'support:create', hotkey: 'c' },
        requires: 'support.thread.manage',
      },
    ],
  },
  // `/records` — the Records sheet (owner 2026-10-06, docs/refactors/records):
  // Find narrows the query server-side (`q`). WHERE before WHAT: Sort leads,
  // then the grain, the date axis + its window, who did what when (event,
  // staffer, its own day window), then the counted facets with include and
  // exclude (`NAV_FACET_GROUPS.records`). The body paints records only.
  // `recentsPanel`: view-less, but the page opens its own panel.
  records: {
    recentsPanel: true,
    search: { placeholder: 'Find records', source: 'url-param', param: RECORDS_FIND_PARAM },
    controls: {
      order: ['sort', 'choices', 'dateRanges', 'staff', 'facets'],
      sort: {
        param: RECORDS_SORT_PARAM,
        dirParam: RECORDS_DIR_PARAM,
        defaultValue: 'date',
        // A Records line carries no journey: those sorts are Fulfilled's (`RECORDS_JOURNEY_SORTS`).
        options: RECORDS_SORTS.filter((value) => !(RECORDS_JOURNEY_SORTS as readonly string[]).includes(value)).map((value) => ({
          value,
          label: RECORDS_SORT_LABEL[value],
          dir: RECORDS_SORT_DIR[value],
        })),
      },
      choices: [
        {
          id: 'grain',
          label: 'Grain',
          param: RECORDS_GRAIN_PARAM,
          options: RECORDS_GRAINS.map((value) => ({ value, label: RECORDS_GRAIN_LABEL[value] })),
          defaultValue: RECORDS_DEFAULT_GRAIN,
          clearParams: [],
        },
        {
          id: 'axis',
          label: 'Date',
          param: RECORDS_AXIS_PARAM,
          options: RECORDS_AXES.map((value) => ({ value, label: RECORDS_AXIS_LABEL[value] })),
          defaultValue: RECORDS_DEFAULT_AXIS,
          clearParams: [],
        },
        {
          id: 'event',
          label: 'Event',
          param: RECORDS_EVENT_PARAM,
          options: RECORDS_EVENTS.map((value) => ({ value, label: RECORDS_EVENT_LABEL[value] })),
          clearParams: [],
        },
      ],
      dateRanges: [
        {
          id: 'window',
          label: 'Window',
          fromParam: RECORDS_FROM_PARAM,
          toParam: RECORDS_TO_PARAM,
          clearParams: [],
          placeholder: RECORDS_DEFAULT_WINDOW_LABEL,
          // A pasted list has no window (`recordsWindow`): the row says so instead of a window it is not using.
          unsetWith: { param: RECORDS_REFS_PARAM, placeholder: 'Any day' },
        },
        {
          id: 'event-day',
          label: 'Event day',
          fromParam: RECORDS_EVENT_FROM_PARAM,
          toParam: RECORDS_EVENT_TO_PARAM,
          clearParams: [],
          placeholder: 'Any day',
        },
      ],
      staff: [{ id: 'event-by', param: RECORDS_EVENT_BY_PARAM, label: 'By' }],
    },
  },
  // ── Scan Stations ───────────────────────────────────────────────────────
  triage: {
    search: { placeholder: 'Filter scanned cartons…', source: 'url-param', param: 'triq' },
    scanInput: { grammar: 'arrival', endpoint: '/api/receiving/lookup-po' },
  },
  receive: {
    search: { placeholder: 'Filter cartons or incoming…', source: 'url-param', param: INBOUND_FIND_PARAM },
    savedViews: SHEET_SAVED_VIEW_CONFIG['tech-all'],
    scanInput: { grammar: 'unbox', endpoint: '/api/receiving/lookup-po' },
    // Scan stations preserve their operational/server order. They deliberately
    // expose neither a Sort-by control nor a local priority selector.
    actions: [
      { action: { id: 'unbox.resume', label: 'Unbox', intent: 'unbox:resume' } },
      { action: { id: 'unbox.check', label: 'Check', intent: 'unbox:check-unreceived' } },
      { action: { id: 'unbox.add-po', label: 'Add purchase order', intent: 'receiving-composer:purchase' } },
    ],
  },
  // No view rows: status is the Order status facet, not a child. `recentsPanel`
  // is the resolver's switch for a view-less page that still opens a section
  // panel (‹ Receiving, the inbound modes, Find, scan, filters) — never the top map.
  pickup: {
    recentsPanel: true,
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
  // The outbound package board (`src/lib/live-feed/route.ts` LIVE_FEED_PARAMS): Find opens the
  // match (`?q=`); Carrier · Channel are NAV_FACET_GROUPS['live-feed']; Staff = packages the
  // staffer is assigned to, picked or packed (`readLiveFeedFilters`).
  'live-feed': {
    search: { placeholder: 'Scan or type tracking, order #, SKU', source: 'url-param', param: 'q' },
    controls: {
      staff: [{ id: 'staff', param: 'staff', label: 'Staff' }],
    },
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
    items: {
      // Ready (`?fbaMode=ready`): the allocation history DataTable's Find
      // (`?q=`), disposition facet (`?rtab=`, unset = every tested unit) and
      // saved views — record selection is sidebar chrome (ruling A1).
      ready: {
        search: { placeholder: 'Filter tested units…', source: 'url-param', param: 'q' },
        savedViews: SHEET_SAVED_VIEW_CONFIG.ready,
        controls: {
          choices: [{
            id: 'ready-disposition',
            label: 'Destination',
            param: 'rtab',
            options: [
              { value: 'fba', label: CHANNEL_DISPOSITION_LABELS.FBA },
              { value: 'prebox', label: CHANNEL_DISPOSITION_LABELS.PREBOX_STOCK },
              { value: 'hold', label: CHANNEL_DISPOSITION_LABELS.HOLD },
            ],
            clearParams: [],
          }],
        },
      },
    },
  },
  // Labels & docs: Bulk (bare) · Orders (`?view=orders`) are the two saved
  // views. The header split CTA's face is the view's own job — Bulk uploads
  // PDFs (⌘O) then prints the checked or open file (⌘P); Orders prints the
  // checked or open order (⌘P). Both narrow on the SERVER through `?q=`: Bulk
  // over file name, tracking and matched order number (`FILES_CONTROLS` + the
  // `label-intake.uploads` facets); Orders over order number, tracking, SKU,
  // item number and product title (`ORDERS_CONTROLS` + the
  // `label-intake.orders` facets).
  'label-intake': {
    viewKeys: true,
    search: { placeholder: 'File, tracking or order', source: 'url-param', param: PRINT_FILE_QUERY_PARAM },
    actions: labelsDocsActions('uploads'),
    items: {
      uploads: {
        search: { placeholder: 'File, tracking or order', source: 'url-param', param: PRINT_FILE_QUERY_PARAM },
        controls: FILES_CONTROLS,
      },
      orders: {
        search: { placeholder: 'Order, tracking, SKU or product', source: 'url-param', param: ORDER_PACKET_QUERY_PARAM },
        actions: labelsDocsActions('orders'),
        controls: ORDERS_CONTROLS,
      },
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
