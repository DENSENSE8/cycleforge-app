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

/** `?staff=` — the universal staff filter every Shipping queue list reads (`STAFF_FILTER_PARAM`, `useToShipChrome.ts:59`, `UnshippedTable.tsx:220`). */
const STAFF_CONTROL: NavControls = { staff: { param: 'staff' } };

/** Shipped's period picker (`useShippedTableFilters.setPeriodRange`) plus its `?staff=` (`effStaffId`). */
const SHIPPED_CONTROLS: NavControls = {
  staff: { param: 'staff' },
  dateRange: {
    fromParam: 'dateFrom',
    toParam: 'dateTo',
    clearParams: ['shippedWeekOffset', 'allDates'],
    placeholder: 'This week',
  },
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
  { action: { id: 'orders.add', label: 'Add one order (review first)', href: '/shipping/orders?triage=new' } },
  { action: { id: 'orders.add-test', label: 'Add test order', intent: 'orders-intake:test' } },
  { action: { id: 'orders.demo-sync', label: 'Demo sync (sample data)', intent: 'orders-intake:demo' } },
  { action: { id: 'orders.past-imports', label: 'Past imports', intent: 'orders:past-imports' } },
  { action: { id: 'orders.labels', label: 'Labels', intent: 'orders:labels-walk' } },
];

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
    items: {
      po: { savedViews: UNSHIPPED_VIEWS, controls: STAFF_CONTROL },
      pick: { savedViews: UNSHIPPED_VIEWS, actions: TO_SHIP_ACTIONS, controls: STAFF_CONTROL },
      triage: { savedViews: UNSHIPPED_VIEWS, actions: TO_SHIP_ACTIONS, controls: STAFF_CONTROL },
      shipped: { savedViews: SHIPPED_VIEWS, controls: SHIPPED_CONTROLS },
    },
  },
  // Header split action `IncomingDeskAddAction` — the Global Add inbound leaves.
  // Find narrows the ledger through the desk store (the ledger toolbar's old
  // "Filter incoming…" field); On the way also takes a pasted vendor list,
  // answered by the Unbox Check (`IncomingBulkTrackingPanel`'s Check receipts).
  incoming: {
    items: {
      pipeline: {
        search: {
          placeholder: 'Search deliveries',
          source: 'desk-store',
          bulk: { check: 'inbound-check', param: REF_IN_PARAM, statusParam: RECON_PARAM },
        },
      },
      docked: { search: { placeholder: 'Search received history', source: 'desk-store' } },
    },
    actions: [
      { action: { id: 'incoming.add-po', label: 'Add PO', intent: 'global-add:incoming-po' } },
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
  sourcing: {
    search: { placeholder: 'Search sourcing', source: 'url-param', param: 'q' },
    items: {
      scout: { search: { placeholder: 'Model number or serial…', source: 'url-param', param: 'q' } },
      suppliers: { search: { placeholder: 'Filter suppliers…', source: 'url-param', param: 'q' } },
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
    scanInput: { grammar: 'station', endpoint: '/api/tech/scan' },
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
    scanInput: { grammar: 'fnsku', endpoint: '/api/fba/fnskus/validate' },
  },
};
