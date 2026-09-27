/**
 * Per-page parity — the machine-checked subset of docs/refactors/sidebar/PARITY.md.
 *
 * Each row is something the OLD sidebar or desk chrome gives the operator on
 * that page (the tab row, the context panel, the desk header, the scan band)
 * and that the contextual sidebar must therefore carry before the page flips
 * to `contextual`. Stage-hosted things (row verbs, in-page tables, right-pane
 * scan fields) stay in the page body and are not rows here.
 *
 * `parityGaps(pageId)` resolves the page's own context plus one context per
 * section view (all permissions, no org override) and lists every row none of
 * them covers. The resolver test fails if a `contextual` page has a gap; the
 * sidebar probe prints the gaps for the rest.
 */

import { ALL_PERMISSIONS } from '@/lib/auth/permissions-shared';
import { getSidebarPageNav } from '@/lib/sidebar-navigation';
import { buildNavContext, declaredRouteParams } from './build';
import type { NavContext } from './schema';

export type ParityKind = 'view' | 'param' | 'action' | 'recents' | 'rowAction' | 'paging' | 'scanInput' | 'savedViews';

export interface ParityRow {
  kind: ParityKind;
  /**
   * view: section item id · param: URL key · action: action id · recents: surface ·
   * rowAction: recents row verb (`delete` carries its undo, restore) · paging: the paged recents surface ·
   * scanInput: grammar · savedViews: storage key.
   */
  id: string;
  /** Where the old UI provides it (file:line, as PARITY.md cites it). */
  source: string;
  /** param rows: the section view whose route spec must declare the key (else any of the page's). */
  view?: string;
}

/** `[kind, id, source, view?]` — `view` pins a param to the section view whose route must declare it. */
type Row = readonly [ParityKind, string, string, string?];

const ROWS: Readonly<Record<string, readonly Row[]>> = {
  'ai-chat': [
    ['action', 'chat.new', 'src/components/sidebar/master-nav/SidebarNavList.tsx:547-560 (Chat row `+`)'],
    ['recents', 'assistant.sessions', 'src/components/sidebar/master-nav/ChatSessionsNav.tsx:176-234'],
    ['rowAction', 'rename', 'src/components/sidebar/master-nav/ChatSessionsNav.tsx:74-80,150-158'],
    ['rowAction', 'delete', 'src/components/sidebar/master-nav/ChatSessionsNav.tsx:82-98,160-163 (Undo → restore)'],
    ['paging', 'assistant.sessions', 'src/components/sidebar/master-nav/ChatSessionsNav.tsx:220-230 (Show more)'],
  ],
  home: [
    ['view', 'all', 'src/features/home/DailyAgenda.tsx:260-276'],
    ['view', 'checklist', 'src/features/home/DailyAgenda.tsx:260-276; src/lib/daily/agenda-lens.ts:8-22'],
    ['view', 'task', 'src/features/home/DailyAgenda.tsx:260-276'],
    ['view', 'ticket', 'src/features/home/DailyAgenda.tsx:260-276'],
    ['view', 'task_ticket', 'src/features/home/DailyAgenda.tsx:260-276'],
    ['param', 'tab', 'src/features/home/DailyAgenda.tsx:93,148-151'],
    ['action', 'daily.add-task', 'src/features/home/DailyAgenda.tsx:232-239 (desk header CTA)'],
  ],
  sales: [
    ['view', 'counter', 'src/lib/sidebar-navigation.ts:844'],
    ['view', 'sales', 'src/lib/sidebar-navigation.ts:845'],
    ['view', 'pickup', 'src/lib/sidebar-navigation.ts:846'],
    ['view', 'repairs', 'src/lib/sidebar-navigation.ts:847'],
    ['param', 'mode', 'src/lib/routing/query-mode-routes.ts:94', 'sales'],
    ['action', 'walk-in.new-sale', 'src/components/walk-in/WalkInHistorySidebar.tsx:18-23,55-64'],
    ['action', 'walk-in.local-pickup', 'src/components/walk-in/WalkInHistorySidebar.tsx:24-29,55-64'],
    ['action', 'walk-in.repair-intake', 'src/components/walk-in/WalkInHistorySidebar.tsx:30-35,55-64'],
  ],
  operations: [
    ['view', 'live', 'src/lib/sidebar-navigation.ts:866'],
    ['view', 'checks', 'src/lib/sidebar-navigation.ts:867'],
    ['view', 'packing-review', 'src/lib/sidebar-navigation.ts:870'],
    ['view', 'history', 'src/lib/sidebar-navigation.ts:873'],
    ['view', 'signals', 'src/lib/sidebar-navigation.ts:874'],
    ['view', 'reconciliation', 'src/lib/sidebar-navigation.ts:875'],
    ['view', 'goals', 'src/lib/sidebar-navigation.ts:877'],
    ['view', 'quality', 'src/lib/sidebar-navigation.ts:878'],
    ['view', 'staff', 'src/lib/sidebar-navigation.ts:879'],
    ['view', 'sync', 'src/lib/sidebar-navigation.ts:880'],
    ['view', 'logs', 'src/lib/sidebar-navigation.ts:881'],
    ['param', 'dim', 'src/components/sidebar/OperationsSidebarPanel.tsx:407-412', 'history'],
    ['param', 'order', 'src/components/sidebar/operations/useOperationsTimelineUrlState.ts:143-154', 'history'],
    ['param', 'serial', 'src/components/sidebar/operations/useOperationsTimelineUrlState.ts:143-154', 'history'],
    ['param', 'tracking', 'src/components/sidebar/operations/useOperationsTimelineUrlState.ts:143-154', 'history'],
    ['param', 'unit', 'src/components/sidebar/operations/useOperationsTimelineUrlState.ts:143-154', 'history'],
    ['param', 'view', 'src/components/sidebar/operations/HistoryBrowseFilters.tsx:118-136', 'history'],
    ['param', 'stations', 'src/components/sidebar/operations/HistoryBrowseFilters.tsx:139-149', 'history'],
    ['param', 'types', 'src/components/sidebar/operations/HistoryBrowseFilters.tsx:151-157', 'history'],
    ['param', 'sources', 'src/components/sidebar/operations/HistoryBrowseFilters.tsx:159-165', 'history'],
    ['param', 'from', 'src/components/sidebar/operations/HistoryBrowseFilters.tsx:167-180', 'history'],
    ['param', 'until', 'src/components/sidebar/operations/HistoryBrowseFilters.tsx:167-180', 'history'],
    ['param', 'staffId', 'src/components/sidebar/operations/HistoryBrowseFilters.tsx:182-197', 'history'],
    ['param', 'window', 'src/components/sidebar/OperationsSidebarPanel.tsx:252-257,313-327', 'signals'],
    ['param', 'signalKind', 'src/components/sidebar/OperationsSidebarPanel.tsx:328-343', 'signals'],
    ['param', 'q', 'src/components/sidebar/OperationsSidebarPanel.tsx:350-357', 'signals'],
    ['param', 'goalView', 'src/components/sidebar/GoalsSidebarPanel.tsx:18-23,245-265', 'goals'],
    ['param', 'search', 'src/components/sidebar/GoalsSidebarPanel.tsx:336-343', 'goals'],
    ['param', 'search', 'src/components/admin/LogsSidebarPanel.tsx:170-192', 'logs'],
    ['param', 'staffView', 'src/components/admin/StaffScheduleSidebarPanel.tsx:27-37,93-120', 'staff'],
    ['param', 'logKind', 'src/components/admin/LogsSidebarPanel.tsx:44-48,139-150', 'logs'],
    ['param', 'actorStaffId', 'src/components/admin/LogsSidebarPanel.tsx:152-167', 'logs'],
    ['param', 'eventId', 'src/components/admin/LogsSidebarPanel.tsx:200-233', 'logs'],
    ['savedViews', 'operations', 'src/components/sidebar/operations/HistoryBrowseFilters.tsx:102-136; src/hooks/useOperationsSavedViews.ts:24-57'],
  ],
  reports: [
    ['view', 'staff-day', 'src/app/reports/page.tsx:38-58 (tab=staff)'],
    ['view', 'packer-day', 'src/app/reports/page.tsx:38-58 (tab=packer)'],
    ['view', 'utilization', 'src/app/reports/page.tsx:38-58'],
    ['view', 'velocity', 'src/app/reports/page.tsx:38-58'],
    ['view', 'dead-stock', 'src/app/reports/page.tsx:38-58 (tab=dead)'],
    ['view', 'tasks', 'src/app/reports/page.tsx:38-58'],
    ['view', 'activity', 'src/app/reports/page.tsx:38-58'],
    ['param', 'tab', 'src/app/reports/page.tsx:413-414', 'utilization'],
    ['action', 'reports.refresh', 'src/app/reports/page.tsx:467-479 (desk header CTA)'],
  ],
  triage: [
    ['scanInput', 'arrival', 'src/components/sidebar/receiving/ReceivingScanBands.tsx:41-94; src/components/sidebar/ReceivingSidebarPanel.tsx:502'],
    ['recents', 'receiving.scanned', 'src/components/sidebar/receiving/ReceivingRailBody.tsx:51-63; src/lib/receiving/rail/feeds.ts:424-437'],
    ['param', 'triq', 'src/components/sidebar/ReceivingSidebarPanel.tsx:174-193'],
    ['param', 'staff', 'src/components/sidebar/receiving/ReceivingFeedRail.tsx:78-80'],
  ],
  receive: [
    ['scanInput', 'unbox', 'src/components/sidebar/receiving/ReceivingScanBands.tsx:119-148; src/components/sidebar/ReceivingSidebarPanel.tsx:526'],
    ['recents', 'receiving.unbox_opened', 'src/components/sidebar/receiving/ReceivingRailBody.tsx:66-75; src/lib/receiving/rail/feeds.ts:342-368'],
    ['param', 'staff', 'src/components/sidebar/receiving/ReceivingFeedRail.tsx:78-80'],
    ['action', 'unbox.resume', 'src/components/receiving/unbox/UnboxDeskActions.tsx:42-60,87-95'],
    ['action', 'unbox.check', 'src/components/receiving/unbox/UnboxDeskActions.tsx:31-35,77-86'],
    ['action', 'unbox.add-po', 'src/components/receiving/unbox/UnboxDeskActions.tsx:37-40,65-76'],
  ],
  pickup: [
    ['scanInput', 'pickup', 'src/components/sidebar/receiving/ReceivingScanBands.tsx:166-193; src/components/sidebar/ReceivingSidebarPanel.tsx:463-481'],
    ['recents', 'pickup.orders', 'src/components/receiving/pickup/PickupSidebarRail.tsx:27-32,63-130'],
    ['param', 'lcpu', 'src/components/receiving/pickup/PickupSidebarRail.tsx:61,93-102'],
  ],
  // Rail-less; everything lives on the stage (RepairTable, intake overlay).
  repair: [],
  testing: [
    ['scanInput', 'testing', 'src/components/sidebar/receiving/TestingScanBar.tsx:27-149'],
    ['recents', 'testing.opened', 'src/components/sidebar/receiving/TestingRecentRail.tsx:20-35'],
  ],
  'ready-to-pack': [
    ['scanInput', 'station', 'src/components/sidebar/tech/ShippingScanBand.tsx:46-234'],
    ['recents', 'tech.scans', 'src/components/sidebar/shipping/ShippingStaffScanHistoryRail.tsx:45-174'],
  ],
  incoming: [
    ['view', 'pipeline', 'src/lib/sidebar-navigation.ts:964'],
    ['view', 'docked', 'src/lib/sidebar-navigation.ts:965'],
    ['param', 'lane', 'src/lib/routing/receiving-routes.ts:174', 'docked'],
    ['action', 'incoming.add-po', 'src/components/receiving/incoming/IncomingDeskAddAction.tsx:69-71,144-150'],
    ['action', 'incoming.add-return', 'src/components/receiving/incoming/IncomingDeskAddAction.tsx:73-75,153-157'],
    ['action', 'incoming.import-returns', 'src/components/receiving/incoming/IncomingDeskAddAction.tsx:77-79,158-166'],
    ['action', 'incoming.import-zoho', 'src/components/receiving/incoming/IncomingDeskAddAction.tsx:81-83,167-172'],
    ['action', 'incoming.import-ebay', 'src/components/receiving/incoming/IncomingDeskAddAction.tsx:85-87,173-179'],
  ],
  // Compatibility entry — no path resolves to it (PARITY.md §receiving, finding 1).
  receiving: [],
  sourcing: [
    ['view', 'queue', 'src/lib/sidebar-navigation.ts:1008'],
    ['view', 'scout', 'src/lib/sidebar-navigation.ts:1009'],
    ['view', 'watchlist', 'src/lib/sidebar-navigation.ts:1010'],
    ['view', 'searches', 'src/lib/sidebar-navigation.ts:1011'],
    ['view', 'suppliers', 'src/lib/sidebar-navigation.ts:1012'],
    ['view', 'models', 'src/lib/sidebar-navigation.ts:1015'],
    ['view', 'compatibility', 'src/lib/sidebar-navigation.ts:1016'],
    ['param', 'q', 'src/components/sidebar/SourcingSidebarPanel.tsx:44-71', 'scout'],
    ['param', 'by', 'src/components/sidebar/SourcingSidebarPanel.tsx:16-19,78-88', 'scout'],
    ['param', 'status', 'src/components/sidebar/SourcingSidebarPanel.tsx:20-30,148-166', 'queue'],
    ['param', 'type', 'src/components/sidebar/SourcingSidebarPanel.tsx:31-37,118-135', 'suppliers'],
    ['param', 'search', 'src/components/admin/sourcing/BoseModelsSidebarPanel.tsx:27,64-77; CompatibilitySidebarPanel.tsx:25,44-57', 'models'],
    ['param', 'model', 'src/components/admin/sourcing/BoseModelsSidebarPanel.tsx:50,89', 'models'],
    ['param', 'boseModelId', 'src/components/admin/sourcing/CompatibilitySidebarPanel.tsx:26,60-83', 'compatibility'],
    ['action', 'sourcing.add-model', 'src/components/admin/sourcing/BoseModelsSidebarPanel.tsx:44-61'],
  ],
  fba: [
    ['view', 'plan', 'src/lib/sidebar-navigation.ts:1034'],
    ['view', 'combine', 'src/lib/sidebar-navigation.ts:1035'],
    ['view', 'shipped', 'src/lib/sidebar-navigation.ts:1036'],
    ['param', 'fbaMode', 'src/components/fba/sidebar/fba-workspace-hooks.ts:44-55', 'plan'],
    // Orphaned on the live route today (only `/fba`, which redirects, mounts it).
    ['scanInput', 'fnsku', 'src/components/fba/sidebar/FbaWorkspaceScanField.tsx:42-48; src/components/fba/StationFbaInput.tsx:55-83'],
  ],
  // Rail-less ledger; its view tabs and upload live in the stage.
  'label-intake': [],
  outbound: [
    ['view', 'exceptions', 'src/lib/outbound/desk-views.ts; e7dc59d^:src/design-system/components/DeskPageChrome.tsx:298-320'],
    ['view', 'po', 'src/lib/outbound/desk-views.ts (Picking › PO paired)'],
    ['view', 'pick', 'src/lib/outbound/desk-views.ts (Picking › Pick list)'],
    ['view', 'triage', 'src/lib/outbound/desk-views.ts (To ship)'],
    ['view', 'shipped', 'src/lib/outbound/desk-views.ts'],
    ['param', 'pair', 'src/lib/outbound/desk-views.ts DESK_PAIR_PARAM; src/lib/orders/desk-view-filters.ts', 'po'],
    ['param', 'queue', 'src/lib/outbound/desk-views.ts DESK_QUEUE_PARAM', 'pick'],
    ['param', 'category', 'e7dc59d^:src/components/outbound/orders/exceptions/OrderExceptionsWorkbench.tsx:254-282', 'exceptions'],
    ['param', 'order', 'e7dc59d^:src/components/outbound/orders/exceptions/OrderExceptionsWorkbench.tsx:227-238', 'exceptions'],
    ['param', 'stage', 'src/components/unshipped/useToShipChrome.ts:147-152', 'triage'],
    ['param', 'aging', 'src/components/unshipped/useToShipChrome.ts:143-146', 'triage'],
    ['param', 'late', 'src/utils/dashboard-search-state.ts:124-148', 'triage'],
    ['param', 'attention', 'src/utils/dashboard-search-state.ts:119-151', 'triage'],
    ['param', 'ustatus', 'src/utils/dashboard-search-state.ts:116-154', 'triage'],
    ['param', 'rowFlag', 'src/utils/dashboard-search-state.ts:114-156', 'triage'],
    ['param', 'cage', 'src/utils/dashboard-search-state.ts:111-139', 'triage'],
    ['param', 'staff', 'src/hooks/useStaffFilter.ts; src/components/unshipped/useToShipChrome.ts:59', 'triage'],
    ['param', 'sort', 'e7dc59d^:src/components/outbound/orders/OutboundOrdersLedger.tsx:479', 'triage'],
    ['param', 'dir', 'e7dc59d^:src/components/outbound/orders/OutboundOrdersLedger.tsx:479', 'triage'],
    ['param', 'shippedFilter', 'src/components/shipped/dashboard-table/useShippedTableFilters.ts:52-58', 'shipped'],
    ['param', 'shippedSearchField', 'src/components/shipped/dashboard-table/useShippedTableFilters.ts:50', 'shipped'],
    ['param', 'shippedWeekOffset', 'src/components/shipped/dashboard-table/useShippedTableFilters.ts:61-64', 'shipped'],
    ['param', 'ostatus', 'src/components/shipped/dashboard-table/useShippedTableFilters.ts:76', 'shipped'],
    ['param', 'packedBy', 'src/components/shipping/shipped-filter/useShippedFilterActions.ts:70-72', 'shipped'],
    ['param', 'testedBy', 'src/components/shipping/shipped-filter/useShippedFilterActions.ts:66-68', 'shipped'],
    ['param', 'dateFrom', 'src/components/shipping/shipped-filter/useShippedFilterActions.ts:74-91', 'shipped'],
    ['param', 'dateTo', 'src/components/shipping/shipped-filter/useShippedFilterActions.ts:74-91', 'shipped'],
    ['param', 'allDates', 'src/components/shipping/shipped-filter/useShippedFilterActions.ts:74-91', 'shipped'],
    ['param', 'exceptions', 'src/components/shipping/shipped-filter/useShippedFilterActions.ts:52-56', 'shipped'],
    ['param', 'carrier', 'src/components/shipping/shipped-filter/useShippedFilterActions.ts:58-60', 'shipped'],
    ['param', 'statusCategory', 'src/components/shipping/shipped-filter/useShippedFilterActions.ts:62-64', 'shipped'],
    ['action', 'orders.sync', 'e7dc59d^:src/components/outbound/orders/OrdersDeskAddAction.tsx:115-120'],
    ['action', 'orders.sync-platforms', 'e7dc59d^:src/components/outbound/orders/OrdersDeskAddAction.tsx:125-136; src/components/outbound/orders/useToShipPlatformSyncMenu.ts'],
    ['action', 'orders.upload-csv', 'e7dc59d^:src/components/outbound/orders/OrdersDeskAddAction.tsx:137-146'],
    ['action', 'orders.export-csv', 'e7dc59d^:src/components/outbound/orders/OrdersDeskAddAction.tsx:147-159'],
    ['action', 'orders.add', 'e7dc59d^:src/components/outbound/orders/OrdersDeskAddAction.tsx:160-165 (?triage=new)'],
    ['action', 'orders.add-test', 'e7dc59d^:src/components/outbound/orders/OrdersDeskAddAction.tsx:166-171'],
    ['action', 'orders.demo-sync', 'e7dc59d^:src/components/outbound/orders/OrdersDeskAddAction.tsx:172-177'],
    ['action', 'orders.past-imports', 'e7dc59d^:src/components/outbound/orders/OrdersDeskPastImportsAction.tsx'],
    ['action', 'orders.labels', 'e7dc59d^:src/components/outbound/orders/paperwork/OrdersDeskLabelsAction.tsx'],
    ['savedViews', 'unshipped_saved_views', 'e7dc59d^:src/components/outbound/orders/OutboundOrdersLedger.tsx:482-488; src/components/dashboard/orders-queue/useOrdersQueueFeed.ts:253-256'],
    ['savedViews', 'shipped_saved_views', 'src/components/dashboard/orders-queue/useOrdersQueueFeed.ts:257-261'],
  ],
  'scan-out': [
    ['scanInput', 'scan-out', 'src/components/outbound/scan-out/ScanOutComposerDock.tsx:44-226'],
  ],
  packer: [
    ['scanInput', 'pack', 'src/components/station/PackScanColumn.tsx:391-420'],
    ['recents', 'packer.packs', 'src/components/sidebar/packer/PackRecentPacksRail.tsx:39-168'],
  ],
  products: [
    ['view', 'manuals', 'src/lib/sidebar-navigation.ts:1143'],
    ['view', 'labels', 'src/lib/sidebar-navigation.ts:1144'],
    ['view', 'pairing', 'src/lib/sidebar-navigation.ts:1145'],
    ['view', 'qc', 'src/lib/sidebar-navigation.ts:1146'],
    ['param', 'q', 'src/components/sidebar/ProductsSidebarPanel.tsx:75-78', 'manuals'],
    ['param', 'id', 'src/components/manuals/ManualLibrary.tsx:55', 'manuals'],
    ['param', 'historyId', 'src/components/labels/ProductLabelsRecentRail.tsx:75', 'labels'],
    ['param', 'sort', 'src/components/sidebar/ProductsSidebarPanel.tsx:28-40', 'pairing'],
    ['param', 'sku', 'src/components/sidebar/ProductsSidebarPanel.tsx:149', 'pairing'],
    ['param', 'skuId', 'src/components/sidebar/ProductsSidebarPanel.tsx:210-213', 'qc'],
    ['recents', 'labels.prints', 'src/components/labels/ProductLabelsRecentRail.tsx:75 (GET /api/labels/recent)'],
    ['action', 'pairing.pair-identifier', 'src/components/sidebar/ProductsSidebarPanel.tsx:165'],
    ['action', 'pairing.add-sku', 'src/components/sidebar/ProductsSidebarPanel.tsx:166'],
  ],
  inventory: [
    ['view', 'stock', 'src/lib/sidebar-navigation.ts:1168'],
    ['view', 'sku-exceptions', 'src/lib/sidebar-navigation.ts:1169'],
    ['view', 'ledger', 'src/lib/sidebar-navigation.ts:1170'],
    ['view', 'replenish', 'src/lib/sidebar-navigation.ts:1174'],
    ['view', 'locations', 'src/lib/sidebar-navigation.ts:1176'],
  ],
  support: [
    ['view', 'tickets', 'src/lib/sidebar-navigation.ts:1240-1248'],
    ['view', 'voicemail', 'src/lib/sidebar-navigation.ts:1249-1257'],
    ['view', 'calls', 'src/lib/sidebar-navigation.ts:1258-1266'],
    ['view', 'warranty', 'src/lib/sidebar-navigation.ts:1267-1276'],
    ['view', 'issues', 'src/lib/sidebar-navigation.ts:1277-1286'],
    ['recents', 'support.tickets', 'src/components/support/zendesk/queue/SupportTicketsRecentRail.tsx:22; src/hooks/useRecentTickets.ts:18'],
  ],
  studio: [
    ['view', 'graph', 'src/lib/sidebar-navigation.ts:1304'],
    ['view', 'rules', 'src/lib/sidebar-navigation.ts:1306'],
    ['view', 'catalog', 'src/lib/sidebar-navigation.ts:1307'],
    ['param', 'lens', 'src/components/sidebar/StudioSidebarPanel.tsx:31-44,130-144', 'graph'],
    ['param', 'z', 'src/components/sidebar/StudioSidebarPanel.tsx:46-50,149-158', 'graph'],
    ['action', 'studio.library', 'src/components/studio/StudioLibrary.tsx:55-205 (node palette · templates · issues)'],
  ],
};

export const NAV_PARITY: Readonly<Record<string, readonly ParityRow[]>> = Object.fromEntries(
  Object.entries(ROWS).map(([pageId, rows]) => [
    pageId,
    rows.map(([kind, id, source, view]) => (view ? { kind, id, source, view } : { kind, id, source })),
  ]),
);

const ALL = new Set<string>(ALL_PERMISSIONS);

/** One place on a page the sidebar can show: the canonical href, or one section view. */
export interface PageStop {
  /** Section item id, or `null` for the page's canonical href. */
  viewId: string | null;
  href: string;
  context: NavContext;
}

/**
 * A row is covered when some stop carries it. A param must also survive the
 * stop's route spec (hygiene strips anything else), and a view-pinned param
 * must do so on that view.
 */
function isCovered(row: ParityRow, stops: readonly PageStop[]): boolean {
  switch (row.kind) {
    case 'view':
      return stops.some(
        ({ context }) =>
          context.scope === 'section' &&
          context.sections.some((section) => section.items.some((item) => item.id === row.id)),
      );
    case 'param':
      return stops.some(
        (stop) =>
          (!row.view || stop.viewId === row.view) &&
          stop.context.params.includes(row.id) &&
          declaredRouteParams([new URL(stop.href, 'http://nav.local').pathname]).includes(row.id),
      );
    case 'action':
      return stops.some(({ context }) => (context.actions ?? []).some((action) => action.id === row.id));
    case 'recents':
      return stops.some(({ context }) => context.recents?.surface === row.id);
    case 'rowAction':
      return stops.some(({ context }) => context.recents?.rowActions?.verbs.some((verb) => verb === row.id) ?? false);
    case 'paging':
      return stops.some(({ context }) => context.recents?.surface === row.id && context.recents.paged === true);
    case 'scanInput':
      return stops.some(({ context }) => context.scanInput?.grammar === row.id);
    case 'savedViews':
      return stops.some(({ context }) => context.savedViews?.storageKey === row.id);
  }
}

/** Parity rows the stops leave uncovered. */
export function uncoveredRows(rows: readonly ParityRow[], stops: readonly PageStop[]): ParityRow[] {
  return rows.filter((row) => !isCovered(row, stops));
}

/**
 * Every stop a page offers: its canonical href, then each section view.
 * Resolved with every permission and no org override, so a gap is a contract
 * gap — never one caller's missing door.
 */
export function pageStops(pageId: string): PageStop[] {
  const page = getSidebarPageNav(pageId);
  if (!page) return [];
  const at = (viewId: string | null, href: string): PageStop => {
    const url = new URL(href, 'http://nav.local');
    const context = buildNavContext({ pathname: url.pathname, params: url.searchParams, permissions: ALL, orgNav: null });
    return { viewId, href, context };
  };
  const home = at(null, page.href);
  if (home.context.page.id !== pageId) return [];
  const views = home.context.scope === 'section' ? home.context.sections.flatMap((section) => section.items) : [];
  return [home, ...views.map((item) => at(item.id, item.href))];
}

/** Every PARITY.md row the page's contract does not carry yet. Empty = the page may flip. */
export function parityGaps(pageId: string): ParityRow[] {
  return uncoveredRows(NAV_PARITY[pageId] ?? [], pageStops(pageId));
}
