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
 * sidebar probe prints the gaps for the rest. Operational record feeds are
 * intentionally not parity rows: data belongs in the central workspace, not
 * in the contextual sidebar.
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
  'stations-live': [
    ['param', 'job', 'src/lib/station-feed/query.server.ts'],
    ['param', 'outcome', 'src/lib/station-feed/query.server.ts'],
    ['param', 'staff', 'src/lib/station-feed/query.server.ts'],
    ['param', 'from', 'src/lib/station-feed/query.server.ts'],
    ['param', 'to', 'src/lib/station-feed/query.server.ts'],
    ['param', 'sort', 'src/lib/station-feed/query.server.ts'],
  ],
  'ai-chat': [
    ['action', 'chat.new', 'src/components/sidebar/master-nav/SidebarNavList.tsx:547-560 (Chat row `+`)'],
    ['recents', 'assistant.sessions', 'src/components/sidebar/master-nav/ChatSessionsNav.tsx:176-234'],
    ['rowAction', 'rename', 'src/components/sidebar/master-nav/ChatSessionsNav.tsx:74-80,150-158'],
    ['rowAction', 'delete', 'src/components/sidebar/master-nav/ChatSessionsNav.tsx:82-98,160-163 (Undo → restore)'],
    ['paging', 'assistant.sessions', 'src/components/sidebar/master-nav/ChatSessionsNav.tsx:220-230 (Show more)'],
  ],
  home: [
    ['view', 'tasks', 'src/lib/sidebar-navigation.ts (All tasks parent, G A)'],
    ['view', 'daily', 'src/lib/sidebar-navigation.ts (Daily checklist parent, G D)'],
    ['view', 'projects', 'src/lib/sidebar-navigation.ts (Long-term projects parent, G P)'],
    ['view', 'all', 'src/lib/sidebar-navigation.ts (All tasks · Everything, 1)'],
    ['view', 'task', 'src/lib/sidebar-navigation.ts (All tasks · Standalone, 2)'],
    ['view', 'all-done', 'src/lib/sidebar-navigation.ts (All tasks · Finished, 3)'],
    ['view', 'all-waiting', 'src/lib/sidebar-navigation.ts (All tasks · Waiting, 4 — Pending · Follow-up · Blocked)'],
    ['view', 'checklist', 'src/lib/sidebar-navigation.ts (Daily checklist · Today, 1)'],
    ['view', 'checklist-done', 'src/lib/sidebar-navigation.ts (Daily checklist · Ticked off, 2)'],
    ['view', 'project', 'src/lib/sidebar-navigation.ts (Long-term projects · Active, 1)'],
    ['view', 'project-done', 'src/lib/sidebar-navigation.ts (Long-term projects · Wrapped up, 2)'],
    ['param', 'tab', 'src/features/task-board/useTaskBoard.ts (parseTaskBoardView)'],
    ['param', 'filter', 'src/features/task-board/TaskBulkBar.tsx:228-236 (Open · Waiting · Done · All, moved to the sidebar 2026-10-04)'],
    ['param', 'scope', 'src/features/task-board/TaskBulkBar.tsx:255-263 (Mine · Handed off · Everyone, moved to the sidebar 2026-10-04)'],
    ['param', 'sort', 'src/features/task-board/TaskBulkBar.tsx:290-308 (Display · Order by, moved to the sidebar 2026-10-04)'],
    ['param', 'group', 'src/features/task-board/TaskBulkBar.tsx:290-308 (Display · Group by, moved to the sidebar 2026-10-04)'],
    ['param', 'project', 'src/features/task-board/TaskTable.tsx (project heading focus)'],
    ['param', 'layout', 'src/features/task-board/TaskBulkBar.tsx (List · Columns, V)'],
    ['action', 'daily.add-task', 'src/features/task-board/TaskBoard.tsx (New task, N or C)'],
  ],
  sales: [
    ['view', 'counter', 'src/lib/sidebar-navigation.ts:844'],
    ['view', 'pickup', 'src/lib/sidebar-navigation.ts:846'],
    ['view', 'repairs-all', 'src/lib/sidebar-navigation.ts (Repair service · All repairs)'],
    ['view', 'repairs-shipped-in', 'src/lib/sidebar-navigation.ts (Repair service · Shipped in)'],
    ['view', 'repairs-dropped-off', 'src/lib/sidebar-navigation.ts (Repair service · Dropped off)'],
    ['param', 'mode', 'src/lib/routing/query-mode-routes.ts:94', 'pickup'],
    ['param', 'tab', 'src/components/walk-in/WalkInHistoryHub.tsx'],
    ['param', 'search', 'src/components/repair/RepairCardList.tsx', 'repairs-shipped-in'],
    ['param', 'channel', 'src/components/repair/RepairCardList.tsx', 'repairs-dropped-off'],
    ['param', 'sort', 'src/components/repair/RepairCardList.tsx (card order)', 'repairs-shipped-in'],
    ['savedViews', 'repair_queue_saved_views', 'src/lib/station/table-url-params.ts (repair_queue views)'],
    ['action', 'walk-in.new-sale', 'src/lib/nav/context/pages.ts NAV_PAGE_DECLS.sales.actions'],
    ['action', 'walk-in.local-pickup', 'src/lib/nav/context/pages.ts NAV_PAGE_DECLS.sales.actions'],
    ['action', 'walk-in.repair-intake', 'src/lib/nav/context/pages.ts NAV_PAGE_DECLS.sales.actions'],
  ],
  customers: [
    ['param', 'q', 'src/components/customers/CustomersDesk.tsx'],
  ],
  operations: [
    ['view', 'live', 'src/lib/sidebar-navigation.ts:866'],
    ['view', 'checks', 'src/lib/sidebar-navigation.ts:867'],
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
  'ops-photos': [
    ['view', 'all', 'src/components/photos/PhotoLibraryPage.tsx (all media)'],
    ['view', 'unboxing', 'src/lib/photos/library-filter-state.ts PHOTO_LIBRARY_SCOPE_TABS'],
    ['view', 'local_pickup', 'src/lib/photos/library-filter-state.ts PHOTO_LIBRARY_SCOPE_TABS'],
    ['view', 'packing', 'src/lib/photos/library-filter-state.ts PHOTO_LIBRARY_SCOPE_TABS'],
    ['view', 'repair', 'src/lib/photos/library-filter-state.ts PHOTO_LIBRARY_SCOPE_TABS'],
    ['view', 'claims', 'src/lib/photos/library-filter-state.ts PHOTO_LIBRARY_SCOPE_TABS'],
    ['view', 'outbound', 'src/lib/photos/library-filter-state.ts PHOTO_LIBRARY_SCOPE_TABS'],
    ['param', 'sourceScope', 'src/hooks/usePhotoLibraryUrlState.ts'],
    ['param', 'imageType', 'src/hooks/usePhotoLibraryUrlState.ts'],
    ['param', 'staffId', 'src/components/photos/PhotoLibraryFilterDropdown.tsx:34-73'],
    ['param', 'damageDetected', 'src/components/photos/PhotoLibraryFilterDropdown.tsx:76-87'],
    ['param', 'hasAnalysis', 'src/components/photos/PhotoLibraryFilterDropdown.tsx:88-99'],
    ['param', 'stage', 'src/components/photos/PhotoLibraryFilterDropdown.tsx:102-122', 'unboxing'],
    ['param', 'dateFrom', 'src/components/photos/PhotoDateBreadcrumb.tsx (date crumbs)'],
    ['param', 'dateTo', 'src/components/photos/PhotoDateBreadcrumb.tsx (date crumbs)'],
  ],
  reports: [
    ['view', 'packer-day', 'src/lib/sidebar-navigation.ts (Reports children)'],
    ['view', 'activity', 'src/lib/sidebar-navigation.ts (Reports children)'],
    ['param', 'q', 'src/app/reports/page.tsx (Find)'],
    ['param', 'date', 'src/app/reports/page.tsx (report day)'],
    ['param', 'staffId', 'src/app/reports/page.tsx (staff scope)'],
    ['param', 'staffId', 'src/components/reports/TaskActivityReport.tsx:44-53 (staff filter)', 'activity'],
    ['param', 'type', 'src/components/reports/TaskActivityReport.tsx:54-63 (record kind)', 'activity'],
    ['action', 'reports.refresh', 'src/app/reports/page.tsx'],
    ['action', 'reports.export-packing', 'src/app/reports/page.tsx'],
    ['action', 'reports.export-inbound', 'src/app/reports/page.tsx'],
    ['action', 'reports.export-outbound', 'src/app/reports/page.tsx'],
  ],
  triage: [
    ['scanInput', 'arrival', 'src/components/sidebar/receiving/ReceivingScanBands.tsx:41-94; src/components/sidebar/ReceivingSidebarPanel.tsx:502'],
    ['param', 'triq', 'src/components/sidebar/ReceivingSidebarPanel.tsx:174-193'],
    ['param', 'staff', 'src/components/sidebar/receiving/ReceivingFeedRail.tsx:78-80'],
  ],
  receive: [
    // Queue / Incoming / Recent / History remain workspace states, not sidebar
    // navigation. The contextual parent tier is the complete Scan Stations map.
    ['param', 'unboxview', 'src/utils/unbox-workspace-state.ts'],
    ['scanInput', 'unbox', 'src/components/sidebar/receiving/ReceivingScanBands.tsx:119-148; src/components/sidebar/ReceivingSidebarPanel.tsx:526'],
    ['param', 'staff', 'src/components/sidebar/receiving/ReceivingFeedRail.tsx:78-80'],
    ['action', 'unbox.resume', 'src/components/receiving/unbox/UnboxDeskActions.tsx:38-56,83-91'],
    ['action', 'unbox.check', 'src/components/receiving/unbox/UnboxDeskActions.tsx:29-32,73-82,100'],
    ['action', 'unbox.add-po', 'src/components/receiving/unbox/UnboxDeskActions.tsx:34-36,61-71'],
  ],
  pickup: [
    ['scanInput', 'pickup', 'src/components/sidebar/receiving/ReceivingScanBands.tsx:166-193; src/components/sidebar/ReceivingSidebarPanel.tsx:463-481'],
    ['param', 'lcpu', 'src/components/receiving/pickup/PickupSidebarRail.tsx:61,93-102'],
    ['param', 'q', 'src/components/receiving/pickup/PickupWorkspace.tsx'],
    ['param', 'sort', 'src/components/receiving/pickup/PickupWorkspace.tsx'],
    ['param', 'qc', 'src/components/receiving/pickup/PickupWorkspace.tsx'],
    ['param', 'triage', 'src/components/receiving/pickup/PickupWorkspace.tsx'],
    ['param', 'label', 'src/components/receiving/pickup/PickupWorkspace.tsx'],
    ['param', 'ticket', 'src/components/receiving/pickup/PickupWorkspace.tsx'],
    ['param', 'vendor', 'src/components/receiving/pickup/PickupWorkspace.tsx'],
    ['param', 'pickupFrom', 'src/components/receiving/pickup/PickupWorkspace.tsx'],
    ['param', 'pickupTo', 'src/components/receiving/pickup/PickupWorkspace.tsx'],
  ],
  // Rail-less; everything lives on the stage (RepairCardList, intake overlay).
  repair: [
    ['view', 'all', 'src/lib/sidebar-navigation.ts (All repairs, 1)'],
    ['view', 'shipped-in', 'src/lib/sidebar-navigation.ts (Shipped in, 2)'],
    ['view', 'dropped-off', 'src/lib/sidebar-navigation.ts (Dropped off, 3)'],
    ['param', 'channel', 'src/components/repair/RepairCardList.tsx', 'dropped-off'],
    ['param', 'tab', 'src/components/repair/RepairCardList.tsx (Status)'],
    ['param', 'sort', 'src/components/repair/RepairCardList.tsx (card order)'],
    ['param', 'search', 'src/components/repair/RepairCardList.tsx (Find)'],
    ['savedViews', 'repair_queue_saved_views', 'src/lib/station/table-url-params.ts (repair_queue views)'],
  ],
  testing: [
    ['scanInput', 'testing', 'src/components/sidebar/receiving/TestingScanBar.tsx:27-149'],
  ],
  'ready-to-pack': [
    // Queue lenses stay in the workspace; the sidebar switches stations.
    ['param', 'ship', 'src/utils/shipping-workspace-state.ts'],
    ['param', 'q', 'src/components/outbound/ready/ReadyWorkspaceBody.tsx'],
    ['scanInput', 'station', 'src/components/sidebar/tech/ShippingScanBand.tsx:46-234'],
  ],
  incoming: [
    ['view', 'pipeline', 'src/lib/sidebar-navigation.ts:964'],
    ['view', 'docked', 'src/lib/sidebar-navigation.ts:965'],
    ['param', 'lane', 'src/lib/routing/receiving-routes.ts:174', 'docked'],
    ['action', 'incoming.add-po', 'src/components/receiving/purchases/order-form/InboundAddSplitAction.tsx (Add → /purchasing/new)'],
    ['action', 'incoming.add-return', 'src/components/receiving/purchases/order-form/InboundAddSplitAction.tsx (Add return → ?type=RETURN)'],
    ['action', 'incoming.import-orders', 'src/components/receiving/purchases/order-form/InboundAddSplitAction.tsx (Import orders → /purchasing/import)'],
    ['action', 'incoming.import-zoho', 'src/components/receiving/incoming/IncomingDeskAddAction.tsx (Import Zoho POs)'],
    ['action', 'incoming.import-ebay', 'src/components/receiving/incoming/IncomingDeskAddAction.tsx (Import eBay purchases)'],
    ['savedViews', 'receiving_history_saved_views', 'src/lib/station/table-url-params.ts (receiving_history; the Docked ledger lost its Views menu in the RecordLedger move)'],
    ['param', 'colsort', 'src/components/receiving/history/DockedReceiptsLedger.tsx (toolbar Sort menu)', 'docked'],
    ['param', 'staff', 'src/lib/receiving/receiving-modes.ts applyStaffParam', 'docked'],
    // The toolbar State menu's cut is the Claim · Short · Unfound pills now (owner 2026-09-28: one state, Unboxed).
    ['param', 'dflag', 'src/components/receiving/history/DockedReceiptsLedger.tsx (toolbar State menu → attention pills)', 'docked'],
    ['param', 'dateFrom', 'src/components/receiving/ReceivingLedgers.tsx chromePill (toolbar week pill, `?weekOffset=`)', 'docked'],
    ['param', 'dateTo', 'src/components/receiving/ReceivingLedgers.tsx chromePill (toolbar week pill, `?weekOffset=`)', 'docked'],
    ['param', 'weekOffset', 'src/components/receiving/ReceivingLedgers.tsx chromePill (toolbar week pill)', 'docked'],
    // Server history axis — wire ids existed (`HISTORY_SORT_WIRE_IDS`) with no writer on /incoming until the sidebar's Activity row.
    ['param', 'sort', 'src/lib/receiving/receiving-modes.ts HISTORY_SORT_WIRE_IDS (scanned_newest had no writer)', 'docked'],
    ['savedViews', 'receiving_incoming_saved_views', 'src/lib/station/table-url-params.ts (receiving_incoming; On the way had no Views menu on the RecordLedger)'],
    ['param', 'inbound', 'src/components/station/incoming-grid/useIncomingTableChrome.ts (ledger toolbar Filter funnel, Source)', 'pipeline'],
    ['param', 'colsort', 'src/components/receiving/incoming/IncomingDeliveriesLedger.tsx (ledger toolbar Sort icon)', 'pipeline'],
    ['param', 'coldir', 'src/components/receiving/incoming/IncomingDeliveriesLedger.tsx (ledger toolbar Sort icon)', 'pipeline'],
  ],
  // Purchasing (Receiving mode, owner 2026-10-05): every control its sheet reads (`purchases-params.ts`).
  purchasing: [
    ['savedViews', 'receiving_purchases_saved_views', 'src/lib/station/table-url-params.ts (receiving_purchases)'],
    ['param', 'axis', 'src/lib/receiving/purchases-params.ts PURCHASES_AXIS_PARAM (Date row)'],
    ['param', 'from', 'src/lib/receiving/purchases-params.ts PURCHASES_FROM_PARAM (Window row)'],
    ['param', 'to', 'src/lib/receiving/purchases-params.ts PURCHASES_TO_PARAM (Window row)'],
    ['param', 'source', 'src/lib/nav/facets/contexts.ts NAV_FACET_GROUPS purchasing (Source facet)'],
    ['param', 'vendor', 'src/lib/nav/facets/contexts.ts NAV_FACET_GROUPS purchasing (Vendor facet)'],
    ['param', 'unboxedBy', 'src/lib/receiving/purchases-params.ts PURCHASES_UNBOXED_BY_PARAM (Unboxed by row)'],
    ['param', 'colsort', 'src/components/receiving/purchases/PurchasesSheet.tsx (column sort)'],
    ['param', 'coldir', 'src/components/receiving/purchases/PurchasesSheet.tsx (column sort)'],
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
    // The old context panel (`SourcingSidebarPanel`, BoseModels/Compatibility pickers) — deleted in the port; cited at HEAD~.
    ['param', 'q', 'SourcingSidebarPanel.tsx:44-71 (search bar)', 'scout'],
    ['param', 'by', 'SourcingSidebarPanel.tsx:16-19,78-88 (Model | Serial slider)', 'scout'],
    ['param', 'status', 'SourcingSidebarPanel.tsx:20-24,148-166 (Queue status slider)', 'queue'],
    ['param', 'status', 'SourcingSidebarPanel.tsx:25-30,148-166 (Watchlist status slider)', 'watchlist'],
    ['param', 'type', 'SourcingSidebarPanel.tsx:31-37,118-135 (Suppliers type slider)', 'suppliers'],
    ['param', 'search', 'BoseModelsSidebarPanel.tsx:27,64-77; CompatibilitySidebarPanel.tsx:25,44-57 (picker filter)', 'models'],
    ['param', 'model', 'BoseModelsSidebarPanel.tsx:50,89 (picker; now BoseModelPickerPane in the stage)', 'models'],
    ['action', 'sourcing.add-model', 'BoseModelsSidebarPanel.tsx:44-61 (Add model button)'],
  ],
  fba: [
    ['view', 'ready', 'src/components/fba/FbaOutboundWorkspace.tsx:36-43 (tab row + Ready filter menu)'],
    ['view', 'plan', 'src/components/fba/FbaOutboundWorkspace.tsx:36-43 (tab row)'],
    ['view', 'combine', 'src/lib/fba/fba-modes.ts:35-39 (bare /shipping/fba)'],
    ['view', 'shipped', 'src/components/fba/FbaOutboundWorkspace.tsx:36-43 (tab row)'],
    ['view', 'catalog', 'src/components/fba/FbaOutboundWorkspace.tsx:36-43 (tab row)'],
    ['param', 'fbaMode', 'src/components/fba/sidebar/fba-workspace-hooks.ts:44-55', 'plan'],
    // Orphaned on the live route today (only `/fba`, which redirects, mounts it).
    ['scanInput', 'fnsku', 'src/components/fba/sidebar/FbaWorkspaceScanField.tsx:42-48; src/components/fba/StationFbaInput.tsx:55-83'],
  ],
  // Rail-less triage desk: its view tab row and header verbs (uploads, prints) moved to the sidebar / header split CTA.
  'label-intake': [
    ['view', 'uploads', 'src/features/labels-docs/LabelsDocsDesk.tsx (Bulk desk view, bare route — the file list, `FilesDesk`)'],
    ['view', 'orders', 'src/features/labels-docs/LabelsDocsDesk.tsx (Orders desk view, `?view=orders` — merged Shipping labels + Paperwork, 2026-10-05)'],
    ['param', 'from', 'src/lib/nav/context/pages.ts FILES_CONTROLS (Uploaded date control)', 'uploads'],
    ['param', 'to', 'src/lib/nav/context/pages.ts FILES_CONTROLS (Uploaded date control)', 'uploads'],
    ['param', 'printedFrom', 'src/lib/nav/context/pages.ts FILES_CONTROLS (Printed date control)', 'uploads'],
    ['param', 'printedTo', 'src/lib/nav/context/pages.ts FILES_CONTROLS (Printed date control)', 'uploads'],
    ['param', 'sort', 'src/lib/nav/context/pages.ts FILES_CONTROLS (Sort: Newest uploaded · Oldest uploaded · Last printed)', 'uploads'],
    ['param', 'q', 'src/lib/nav/context/pages.ts label-intake.uploads search (server-side Find)', 'uploads'],
    ['param', 'printing', 'src/lib/nav/facets/contexts.ts label-intake.uploads (Print status: Not printed · Partly printed · Printed)', 'uploads'],
    ['param', 'sort', 'src/lib/nav/context/pages.ts ORDERS_CONTROLS (Sort)', 'orders'],
    ['param', 'q', 'src/lib/nav/context/pages.ts label-intake.orders search (server-side Find)', 'orders'],
    ['param', 'status', 'src/lib/nav/facets/contexts.ts label-intake.orders (Status: Missing · Ready · Printed)', 'orders'],
    ['param', 'gap', 'src/lib/nav/facets/contexts.ts label-intake.orders (Missing slot)', 'orders'],
    ['param', 'channel', 'src/lib/nav/facets/contexts.ts label-intake.orders (Channel)', 'orders'],
    ['action', 'labels-docs.upload', 'src/features/labels-docs/files/FilesDesk.tsx (header Upload, ⌘O — PDFs, no type choice; drop anywhere on the desk)'],
    ['action', 'labels-docs.print-selected', 'src/features/labels-docs/files/FilesDesk.tsx (header Print, ⌘P — checked files, else the open one)'],
    ['action', 'labels-docs.print-orders', 'src/features/labels-docs/orders/OrdersDesk.tsx (header Print order, ⌘P — checked orders, else the open one)'],
    ['action', 'labels-docs.buy-label', 'src/features/labels-docs/orders/OrdersDesk.tsx (header Buy label — opens the desk buy compose, ?view=orders&buy=1)'],
  ],
  outbound: [
    ['view', 'orders', 'src/lib/nav/fbm-destinations.ts (Allocate — the FBM landing destination)'],
    ['view', 'label-intake', 'src/lib/nav/fbm-destinations.ts (Labels & docs — the other FBM destination)'],
    ['param', 'stage', 'src/components/unshipped/useToShipChrome.ts:147-152', 'orders'],
    ['param', 'aging', 'src/components/unshipped/useToShipChrome.ts:143-146', 'orders'],
    ['param', 'late', 'src/utils/dashboard-search-state.ts:124-148', 'orders'],
    ['param', 'attention', 'src/utils/dashboard-search-state.ts:119-151', 'orders'],
    ['param', 'ustatus', 'src/utils/dashboard-search-state.ts:116-154', 'orders'],
    ['param', 'rowFlag', 'src/utils/dashboard-search-state.ts:114-156', 'orders'],
    ['param', 'cage', 'src/utils/dashboard-search-state.ts:111-139', 'orders'],
    ['param', 'staff', 'src/hooks/useStaffFilter.ts; src/components/unshipped/useToShipChrome.ts:59', 'orders'],
    ['param', 'sort', 'e7dc59d^:src/components/outbound/orders/OutboundOrdersLedger.tsx:479', 'orders'],
    ['param', 'dir', 'e7dc59d^:src/components/outbound/orders/OutboundOrdersLedger.tsx:479', 'orders'],
    ['action', 'orders.upload-csv', 'e7dc59d^:src/components/outbound/orders/OrdersDeskAddAction.tsx:137-146'],
    ['action', 'orders.export-csv', 'e7dc59d^:src/components/outbound/orders/OrdersDeskAddAction.tsx:147-159'],
    ['action', 'orders.add', 'e7dc59d^:src/components/outbound/orders/OrdersDeskAddAction.tsx:160-165 (?triage=new)'],
    ['savedViews', 'unshipped_saved_views', 'e7dc59d^:src/components/outbound/orders/OutboundOrdersLedger.tsx:482-488; src/components/dashboard/orders-queue/useOrdersQueueFeed.ts:253-256'],
  ],
  // Fulfilled (owner 2026-10-05): the shared sheet over `GET /api/nav/fulfilled` — every control it reads (`fulfilled-params.ts`).
  fulfilled: [
    ['savedViews', 'outbound_fulfilled_saved_views', 'src/lib/station/table-url-params.ts (outbound_fulfilled)'],
    ['param', 'axis', 'src/lib/outbound/fulfilled-params.ts FULFILLED_AXIS_PARAM (Date row)'],
    ['param', 'from', 'src/lib/outbound/fulfilled-params.ts FULFILLED_FROM_PARAM (Window row)'],
    ['param', 'to', 'src/lib/outbound/fulfilled-params.ts FULFILLED_TO_PARAM (Window row)'],
    ['param', 'channel', 'src/lib/nav/facets/contexts.ts NAV_FACET_GROUPS fulfilled (Channel facet)'],
    ['param', 'carrier', 'src/lib/nav/facets/contexts.ts NAV_FACET_GROUPS fulfilled (Carrier facet)'],
    ['param', 'scan', 'src/lib/nav/facets/contexts.ts NAV_FACET_GROUPS fulfilled (Scan facet)'],
    ['param', 'packer', 'src/lib/outbound/fulfilled-params.ts FULFILLED_PACKER_PARAM (Packed by row)'],
    ['param', 'mine', 'src/lib/outbound/fulfilled-params.ts FULFILLED_MINE_PARAM (Packed by me row → packer=<viewer>)'],
    ['param', 'done', 'src/lib/outbound/fulfilled-params.ts FULFILLED_DONE_PARAM (Done columns row, board)'],
    ['param', 'untracked', 'src/lib/outbound/fulfilled-params.ts FULFILLED_UNTRACKED_PARAM (Untracked row, board)'],
    ['param', 'cards', 'src/lib/outbound/fulfilled-params.ts FULFILLED_CARDS_PARAM (Cards row, board)'],
    ['param', 'group', 'src/lib/outbound/fulfilled-params.ts FULFILLED_GROUP_PARAM (Group by row, board)'],
    ['param', 'colsort', 'src/components/outbound/fulfilled/FulfilledSheet.tsx (column sort)'],
    ['param', 'coldir', 'src/components/outbound/fulfilled/FulfilledSheet.tsx (column sort)'],
  ],
  // New page (no old UI): Live feed — the outbound package board (always today); its record selection is sidebar chrome.
  'live-feed': [
    ['param', 'open', 'src/lib/live-feed/route.ts LIVE_FEED_PARAMS.open (open package)'],
    ['param', 'q', 'src/lib/live-feed/route.ts LIVE_FEED_PARAMS.q (Find) → NAV_PAGE_DECLS[live-feed].search'],
    ['param', 'carrier', 'src/lib/live-feed/route.ts readLiveFeedFilters → NAV_FACET_GROUPS live-feed (Carrier facet)'],
    ['param', 'channel', 'src/lib/live-feed/route.ts readLiveFeedFilters → NAV_FACET_GROUPS live-feed (Channel facet)'],
    ['param', 'staff', 'src/lib/live-feed/route.ts readLiveFeedFilters → NAV_PAGE_DECLS[live-feed].controls.staff'],
    ['param', 'sort', 'src/lib/live-feed/route.ts LIVE_FEED_PARAMS.sort → per-column order menu (StageColumnHeader; owner 2026-10-05, board exempt from the sidebar placement law)'],
  ],
  'scan-out': [
    ['scanInput', 'scan-out', 'src/components/outbound/scan-out/ScanOutComposerDock.tsx:44-226'],
  ],
  packer: [
    // Queue / History stay in the workspace; the sidebar switches stations.
    ['param', 'packview', 'src/utils/pack-workspace-state.ts'],
    ['scanInput', 'pack', 'src/components/station/PackScanColumn.tsx:391-420'],
  ],
  products: [
    ['view', 'catalog', 'src/lib/sidebar-navigation.ts (products children)'],
    ['view', 'manuals', 'src/lib/sidebar-navigation.ts (products children)'],
    ['view', 'labels', 'src/lib/sidebar-navigation.ts (products children)'],
    ['view', 'pairing', 'src/lib/sidebar-navigation.ts (products children)'],
    ['view', 'qc', 'src/lib/sidebar-navigation.ts (products children)'],
    ['param', 'q', 'src/lib/nav/context/pages.ts NAV_PAGE_DECLS.products.search', 'manuals'],
    ['param', 'id', 'src/components/manuals/ManualLibrary.tsx', 'manuals'],
    ['param', 'historyId', 'src/hooks/useLabelsHistoryIdParam.ts', 'labels'],
    ['param', 'sort', 'src/components/sidebar/ProductsSidebarPanel.tsx parsePairingSort', 'pairing'],
    ['param', 'sku', 'src/components/sidebar/ProductsSidebarPanel.tsx PairingSidebarQueue', 'pairing'],
    ['param', 'skuId', 'src/hooks/useProductsSkuIdParam.ts', 'qc'],
    ['action', 'catalog.add-product', 'src/lib/nav/context/pages.ts NAV_PAGE_DECLS.products.items.catalog'],
    ['action', 'catalog.import-csv', 'src/lib/nav/context/pages.ts NAV_PAGE_DECLS.products.items.catalog'],
  ],
  stock: [
    ['view', 'all', 'src/lib/sidebar-navigation.ts (Stock children: All stock)'],
    ['view', 'replenish', 'src/lib/sidebar-navigation.ts (Stock children: Needs replenishment)'],
    ['view', 'fifo', 'src/lib/sidebar-navigation.ts (Stock children: Shipped FIFO)'],
    ['view', 'low-stock', 'src/lib/sidebar-navigation.ts (Stock children: Low stock)'],
    ['view', 'out-of-stock', 'src/lib/sidebar-navigation.ts (Stock children: Out of stock)'],
    ['param', 'q', 'src/components/inventory/stock/StockLedger.tsx (ledger search)', 'all'],
    ['param', 'status', 'src/components/inventory/stock/StockLedger.tsx (stock state)', 'all'],
    ['param', 'sort', 'src/components/inventory/stock/StockLedger.tsx (physical location order)', 'all'],
    ['param', 'room', 'src/components/inventory/stock/StockLedger.tsx (room filter)', 'all'],
    ['param', 'aisle', 'src/components/inventory/stock/StockLedger.tsx (aisle filter)', 'all'],
    ['param', 'open', 'src/components/inventory/stock/StockLedger.tsx (open stock record)', 'all'],
    ['param', 'rtab', 'src/components/replenish/ReplenishWorkspace.tsx (Shipped FIFO view)', 'fifo'],
    ['param', 'rsku', 'src/components/replenish/ReplenishWorkspace.tsx (SKU filter)', 'replenish'],
    ['param', 'rstatus', 'src/components/replenish/ReplenishWorkspace.tsx (status filter)', 'replenish'],
  ],
  inventory: [
    ['view', 'locations', 'src/lib/sidebar-navigation.ts (Locations children: All)'],
    ['view', 'rooms', 'src/lib/sidebar-navigation.ts (Locations children: Rooms)'],
    ['view', 'racks', 'src/lib/sidebar-navigation.ts (Locations children: Racks)'],
    ['view', 'map', 'src/lib/sidebar-navigation.ts (Locations children: Map)'],
    ['view', 'labels', 'src/lib/sidebar-navigation.ts (Locations children: Labels)'],
    ['param', 'tab', 'src/components/warehouse/LocationsWorkspace.tsx (location workspace)', 'locations'],
    ['param', 'q', 'src/components/warehouse/LocationsWorkspace.tsx (location search)', 'locations'],
    ['param', 'status', 'src/components/warehouse/LocationsWorkspace.tsx (location status)', 'locations'],
    ['param', 'showEmpty', 'src/components/warehouse/LocationsWorkspace.tsx (map visibility)', 'map'],
    ['param', 'room', 'src/components/warehouse/racks/RacksDesk.tsx:154 (room select) → NAV_FACET_GROUPS inventory.racks', 'racks'],
  ],
  'qc-labels': [
    ['view', 'all', 'src/lib/sidebar-navigation.ts (qc-labels children)'],
    ['view', 'stock', 'src/lib/sidebar-navigation.ts (qc-labels children)'],
    ['view', 'order', 'src/lib/sidebar-navigation.ts (qc-labels children)'],
    ['param', 'q', 'src/app/inventory/qc-labels/page.tsx (server list filter)'],
    ['action', 'qc-labels.print', 'src/components/inventory/qc-labels/QcLabelsLedger.tsx (print a unit\'s QC label)'],
  ],
  // New page (no old UI): the rows are the handoff's §6 contract, one per control.
  imports: [
    ['view', 'runs', 'docs/design-system/HANDOFF-import-history.md §2.1 (Runs view)'],
    ['view', 'rows', 'docs/design-system/HANDOFF-import-history.md §2.2 (Rows view)'],
    ['param', 'dateFrom', 'docs/design-system/HANDOFF-import-history.md §6 (Date)', 'runs'],
    ['param', 'dateTo', 'docs/design-system/HANDOFF-import-history.md §6 (Date)', 'runs'],
    ['param', 'timeFrom', 'docs/design-system/HANDOFF-import-history.md §6 (Date, with times)', 'runs'],
    ['param', 'timeTo', 'docs/design-system/HANDOFF-import-history.md §6 (Date, with times)', 'runs'],
    ['param', 'dateFrom', 'docs/design-system/HANDOFF-import-history.md §6 (Date)', 'rows'],
    ['param', 'dateTo', 'docs/design-system/HANDOFF-import-history.md §6 (Date)', 'rows'],
    ['param', 'trigger', 'docs/design-system/HANDOFF-import-history.md §6 (Trigger)', 'runs'],
    ['param', 'trigger', 'docs/design-system/HANDOFF-import-history.md §6 (Trigger)', 'rows'],
    ['param', 'status', 'docs/design-system/HANDOFF-import-history.md §6 (Status)', 'runs'],
    ['param', 'staff', 'docs/design-system/HANDOFF-import-history.md §6 (Run by)', 'runs'],
    ['param', 'source', 'docs/design-system/HANDOFF-import-history.md §6 (Source)', 'runs'],
    ['param', 'source', 'docs/design-system/HANDOFF-import-history.md §6 (Source)', 'rows'],
    ['param', 'platform', 'docs/design-system/HANDOFF-import-history.md §6 (Platform)', 'rows'],
    ['param', 'account', 'docs/design-system/HANDOFF-import-history.md §6 (Account)', 'rows'],
    ['param', 'outcome', 'docs/design-system/HANDOFF-import-history.md §6 (Outcome)', 'rows'],
    ['param', 'run', 'docs/design-system/HANDOFF-import-history.md §6 (Run, set by opening a run)', 'rows'],
    ['param', 'sort', 'docs/design-system/HANDOFF-import-history.md §6 (Sort)', 'runs'],
    ['param', 'sort', 'docs/design-system/HANDOFF-import-history.md §6 (Sort)', 'rows'],
    ['param', 'q', 'docs/design-system/HANDOFF-import-history.md §6 (Find)'],
  ],
  // New page (no old UI): the owner-approved hub spec (2026-09-28) — All is the bare URL (the `‹ Exceptions` target), one level per domain, one view per kind, the domain / kind lock, Find, the open record.
  exceptions: [
    ['view', 'fulfillment', 'src/lib/exceptions/types.ts EXCEPTION_DOMAIN_LABEL (level: Fulfillment)'],
    ['view', 'inventory', 'src/lib/exceptions/types.ts EXCEPTION_DOMAIN_LABEL (level: Inventory)'],
    ['view', 'receiving', 'src/lib/exceptions/types.ts EXCEPTION_DOMAIN_LABEL (level: Receiving)'],
    ['view', 'fbm', 'src/lib/exceptions/types.ts EXCEPTION_KIND_SPEC (Fulfillment › FBM)'],
    ['view', 'labels', 'src/lib/exceptions/types.ts EXCEPTION_KIND_SPEC (Fulfillment › Labels & docs)'],
    ['view', 'paperwork', 'src/lib/exceptions/types.ts EXCEPTION_KIND_SPEC (Fulfillment › Paperwork)'],
    ['view', 'unmatched', 'src/lib/exceptions/types.ts EXCEPTION_KIND_SPEC (Fulfillment › Unmatched scans)'],
    ['view', 'pairs', 'src/lib/exceptions/types.ts EXCEPTION_KIND_SPEC (Inventory › Missing pairs)'],
    ['view', 'bins', 'src/lib/exceptions/types.ts EXCEPTION_KIND_SPEC (Inventory › Bin errors)'],
    ['view', 'tracking', 'src/lib/exceptions/types.ts EXCEPTION_KIND_SPEC (Inventory › Tracking)'],
    ['view', 'claim', 'src/lib/exceptions/types.ts EXCEPTION_KIND_SPEC (Receiving › Claim)'],
    ['view', 'short', 'src/lib/exceptions/types.ts EXCEPTION_KIND_SPEC (Receiving › Short)'],
    ['view', 'unfound', 'src/lib/exceptions/types.ts EXCEPTION_KIND_SPEC (Receiving › Unfound)'],
    ['param', 'kind', 'src/lib/exceptions/types.ts EXCEPTION_KIND_PARAM'],
    ['param', 'domain', 'src/lib/exceptions/types.ts EXCEPTION_DOMAIN_PARAM (the FBM › Exceptions lock)'],
    ['param', 'q', 'src/lib/exceptions/types.ts ExceptionListParams.q (Find)'],
    ['param', 'record', 'src/lib/exceptions/types.ts EXCEPTION_RECORD_PARAM (the open exception)'],
  ],
  // New page (owner 2026-10-04; it replaces the Tasks board's Support mode): Queue + the list's views, the status
  // chips, the sidebar facets / sort / group-by, Find and its pasted list, the open item, and New Support item.
  support: [
    ['view', 'queue', 'src/lib/sidebar-navigation.ts (support children: Queue, no view)'],
    ['view', 'needs-reply', 'src/lib/support/list/support-list.ts SUPPORT_LIST_VIEWS'],
    ['view', 'followed-up', 'src/lib/support/list/support-list.ts SUPPORT_LIST_VIEWS'],
    ['view', 'draft-ready', 'src/lib/support/list/support-list.ts SUPPORT_LIST_VIEWS'],
    ['view', 'follow-up-due', 'src/lib/support/list/support-list.ts SUPPORT_LIST_VIEWS'],
    ['view', 'unclassified', 'src/lib/support/list/support-list.ts SUPPORT_LIST_VIEWS'],
    ['view', 'internal', 'src/lib/support/list/support-list.ts SUPPORT_LIST_VIEWS'],
    ['view', 'unassigned', 'src/lib/support/list/support-list.ts SUPPORT_LIST_VIEWS'],
    ['view', 'sync-failed', 'src/lib/support/list/support-list.ts SUPPORT_LIST_VIEWS'],
    ['view', 'check-ins', 'src/lib/support/list/support-list.ts SUPPORT_LIST_VIEWS'],
    ['param', 'view', 'src/lib/support/list/support-list.ts parseSupportListFilter (view)'],
    ['param', 'status', 'src/lib/support/list/support-list.ts parseSupportListFilter (the status chips)'],
    ['param', 'platform', 'src/lib/nav/facets/contexts.ts NAV_FACET_GROUPS support.* (Platform facet)'],
    ['param', 'account', 'src/lib/nav/facets/contexts.ts NAV_FACET_GROUPS support.* (Account facet)'],
    ['param', 'assignee', 'src/lib/nav/facets/contexts.ts NAV_FACET_GROUPS support.* (Assignee facet)'],
    ['param', 'sort', 'src/lib/nav/context/pages.ts NAV_PAGE_DECLS.support.controls.sort'],
    ['param', 'group', 'src/lib/nav/context/pages.ts NAV_PAGE_DECLS.support.controls.group (Group by)'],
    ['param', 'q', 'src/lib/support/list/support-list-db.ts listSupportRows (Find)'],
    ['param', 'refs', 'src/lib/nav/locate/support-params.ts SUPPORT_LOCATE_REFS_PARAM (pasted list)'],
    ['param', 'located', 'src/lib/nav/locate/support-params.ts SUPPORT_LOCATE_STATUS_PARAM (pasted list bucket)'],
    ['param', 'item', 'src/lib/nav/route-tree.ts supportHref (the open Support item)'],
    ['action', 'support.new-item', 'src/features/support/SupportDesk.tsx (N / C: the inline New Support item form)'],
  ],
  // New page (no old UI): Print station (owner 2026-09-29; modes 2026-10-04) — FNSKU labels: All · Reprinted, Find and
  // the open FNSKU; Stations: Find and the open station.
  'print-station': [
    ['view', 'fnsku-labels', 'src/lib/sidebar-navigation.ts (print-station mode: FNSKU labels)'],
    ['view', 'fnsku', 'src/lib/sidebar-navigation.ts (print-station children: All FNSKUs)'],
    ['view', 'fnsku-reprinted', 'src/lib/sidebar-navigation.ts (print-station children: Reprinted)'],
    ['view', 'stations', 'src/lib/sidebar-navigation.ts (print-station mode: Stations)'],
    ['view', 'stations-all', 'src/lib/sidebar-navigation.ts (print-station children: All stations)'],
    ['param', 'view', 'src/app/print-station/page.tsx (server scope: reprinted)'],
    ['param', 'q', 'src/app/print-station/page.tsx (server Find over the FBA catalog)'],
    ['param', 'condition', 'src/lib/nav/context/pages.ts (FNSKU labels Condition choice) → src/lib/print-station/fnsku-queries.ts'],
    ['param', 'fnsku', 'src/features/print-station/FnskuPrintDesk.tsx (the open FNSKU)'],
    ['param', 'station', 'src/features/print-station/PrintStationsDesk.tsx (the open station)', 'stations'],
  ],
  // `/search/list` — the pasted list's body chip rows (bucket facet + sort), moved to its panel (ruling A1/A4).
  search: [
    ['param', 'status', 'src/components/search/pasted-list/PastedListPage.tsx (body BulkStatusChips — the located-bucket facet)'],
    ['param', 'sort', 'src/components/search/pasted-list/PastedListPage.tsx (body BulkSortChips — Pasted · Order ID · Status)'],
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
  // A lane's MODES section names other pages, not this page's views; a page's
  // OWN modes (`<page>.modes`) are stops on this page.
  const own = `${pageId}.modes`;
  const views =
    home.context.scope === 'section'
      ? home.context.sections.filter((section) => !section.id.endsWith('.modes') || section.id === own).flatMap((section) => section.items)
      : [];
  return [home, ...views.map((item) => at(item.id, item.href))];
}

/** Every PARITY.md row the page's contract does not carry yet. Empty = the page may flip. */
export function parityGaps(pageId: string): ParityRow[] {
  return uncoveredRows(NAV_PARITY[pageId] ?? [], pageStops(pageId));
}
