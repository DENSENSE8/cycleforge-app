/**
 * Slot-table cohort — the SoT is the **engine + every PRODUCT_TABLES peer**,
 * not To-ship / orders alone. This is the only DISPLAY eval cohort.
 *
 * Eval and graph runners import this module (via tsx). Scan-station idle↔overlay
 * shell is not a display sibling (`scan-station-overlay-cohort.ts` +
 * `eval:station <id>`).
 *
 * Add a product table → it appears in PRODUCT_TABLES (and REGISTERED_BINDINGS);
 * peers here are derived. Opt a family onto the engine → append
 * SLOT_TABLE_ENGINE_LAYOUT_HOOKS.
 *
 * Header-sort is engine law (`SLOT_TABLE_PAINT_LAW.headerSort` +
 * `isSlotTableChromeTrack`). `eval:cohort slot-table` fails the run when an
 * engine-contract predicate misses or a graphSymbols find has no match.
 */

import { PRODUCT_TABLES } from '@/lib/tables/table-catalog';

/** Always-on tripwire for this cohort. */
export const SLOT_TABLE_COHORT_TRIPWIRE =
  'src/lib/tables/slot-table-cohort.test.ts' as const;

export const SLOT_TABLE_COHORT_LEDGER = 'docs/eval/cohorts/slot-table/LEDGER.md' as const;
export const SLOT_TABLE_COHORT_SNAPSHOTS = 'docs/eval/cohorts/slot-table/snapshots' as const;

/** Engine paths / symbols — graph + critique targets. */
export const SLOT_TABLE_ENGINE = {
  compoundCells: 'src/components/tables/compound/CompoundCells.tsx',
  compoundRow: 'src/components/tables/compound/CompoundRow.tsx',
  stageStaffAssignPopover: 'src/components/tables/compound/StageStaffAssignPopover.tsx',
  assigneeCombobox: 'src/design-system/components/AssigneeCombobox.tsx',
  productTitleLink: 'src/components/tables/compound/ProductTitleLink.tsx',
  useSlotTableLayout: 'src/components/tables/useSlotTableLayout.ts',
  /** The generic column model + sort law a family record drives. */
  slotTableColumns: 'src/components/tables/compound/slot-table-columns.ts',
  /** The family RECORD type — data only, no behavior. */
  slotTableFamily: 'src/lib/tables/slot-table-family.ts',
  materializeTracks: 'src/lib/tables/materialize-tracks.ts',
  externalItemUrl: 'src/utils/external-item-url.ts',
  dateRangePickerField: 'src/design-system/components/DateRangePickerField.tsx',
  useOrderAssignment: 'src/hooks/useOrderAssignment.ts',
  useOptimisticMutation: 'src/lib/optimistic/useOptimisticMutation.ts',
  dataTable: 'src/components/tables/DataTable.tsx',
  queueDisplaySort: 'src/utils/queue-display-sort.ts',
  headerSortLaw: 'src/lib/tables/slot-table-header-sort.ts',
  ledgerGridColumnHeader: 'src/design-system/components/grid/LedgerGridColumnHeader.tsx',
  ledgerGrid: 'src/design-system/components/grid/LedgerGrid.tsx',
  lineQty: 'src/lib/tables/slot-table-line-qty.ts',
  lineMoney: 'src/lib/tables/slot-table-line-money.ts',
  sessionLaws: 'src/lib/tables/slot-table-session-laws.ts',
  compoundRowModel: 'src/components/tables/compound/compound-row-model.ts',
  incomingCatalog: 'src/lib/tables/field-catalog/incoming.ts',
  receivingCatalog: 'src/lib/tables/field-catalog/receiving.ts',
  ordersLayout: 'src/lib/dashboard-order-row-layout.ts',
  ordersQueueRow: 'src/components/dashboard/orders-queue/OrdersQueueTableRow.tsx',
  ordersQueueGroupRow: 'src/components/dashboard/orders-queue/QueueGroupRow.tsx',
  morphingRowActionMenu: 'src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx',
  compoundColumns: 'src/components/tables/compound/compound-columns.ts',
  compoundCell: 'src/components/tables/compound/CompoundCell.tsx',
  compoundGridCell: 'src/components/tables/compound/CompoundGridCell.tsx',
  compoundRowDetailBand: 'src/components/tables/compound/CompoundRowDetailBand.tsx',
  slotTableGroupParentRow: 'src/components/tables/compound/SlotTableGroupParentRow.tsx',
  compoundEdgeRail: 'src/components/tables/compound/CompoundEdgeRail.tsx',
  compoundSelectStatus: 'src/components/tables/compound/compound-select-status.ts',
  compoundSelectStatusFace: 'src/components/tables/compound/CompoundSelectStatusFace.tsx',
  compoundRowChrome: 'src/components/tables/compound/compound-row-chrome.ts',
  ledgerGridLeafRow: 'src/design-system/components/grid/LedgerGridLeafRow.tsx',
  /** The action-bar height law and its two halves (operator 2026-09-15). */
  actionBarLaw: 'src/lib/tables/slot-table-action-bar-law.ts',
  stockStripCell: 'src/components/inventory/location-stock-grid/stock-verb-row-parts.tsx',
  fixedBandHeight: 'src/hooks/useFixedBandHeight.ts',
  /** The identity column's one word, and the list of modules that may not re-word it. */
  idHeaderLaw: 'src/lib/tables/slot-table-id-header-law.ts',
  /** The identity purity law: ID column holds only machine handles, never staff names. */
  identityPurityLaw: 'src/lib/tables/slot-table-identity-purity-law.ts',
  stockActionBar: 'src/components/inventory/location-stock-grid/StockActionBar.tsx',
  graphSymbols: [
    'CompoundItem',
    'CompoundState',
    'useSlotTableLayout',
    'materializeTracks',
    'getExternalUrlByItemNumber',
    'DateRangePickerField',
    'useOptimisticMutation',
    'DataTableFilterMenu',
    'queueSortForColumnKey',
    'LedgerGridColumnHeader',
    'isSlotTableChromeTrack',
    'AssigneeCombobox',
    'ensureLineQtySubtitle',
    'pinLineQtyFirst',
    'ensureLineMoneySubtitle',
    'pinLineMoneyAfterQty',
    'ordersCompoundColumnsFor',
    'COMPOUND_COLUMN_KEYS',
    'MorphingRowActionMenu',
    'StockStripInput',
    'useFixedBandHeight',
    /**
     * The ID HEADER law (operator 2026-09-15). In the graph so `impact` names
     * every peer before anyone edits the word: it is ONE constant behind 36
     * painted headers.
     */
    'SLOT_TABLE_ID_HEADER_WORD',
    /**
     * The IDENTITY PURITY law (operator 2026-09-15).
     * In the graph so `impact` names every peer before identity bindings are modified.
     */
    'SLOT_TABLE_IDENTITY_PURITY_LAW',
  ] as const,
  critiqueFiles: [
    'src/components/tables/compound/CompoundCells.tsx',
    'src/components/tables/compound/CompoundRow.tsx',
    'src/components/tables/compound/StageStaffAssignPopover.tsx',
    'src/components/inventory/location-stock-grid/StockActionBar.tsx',
    'src/design-system/components/AssigneeCombobox.tsx',
    'src/components/tables/compound/CompoundStaffRosterButton.tsx',
    'src/design-system/components/DateRangePickerField.tsx',
    'src/components/tables/useSlotTableLayout.ts',
    'src/utils/external-item-url.ts',
    'src/components/tables/DataTable.tsx',
    'src/design-system/components/grid/LedgerGridColumnHeader.tsx',
    'src/components/tables/compound/CompoundCell.tsx',
    'src/components/tables/compound/CompoundGridCell.tsx',
    'src/components/tables/compound/CompoundRowDetailBand.tsx',
    'src/components/tables/compound/SlotTableGroupParentRow.tsx',
    'src/components/tables/compound/CompoundEdgeRail.tsx',
    'src/components/tables/compound/CompoundSelectStatusFace.tsx',
    'src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx',
    'src/design-system/components/grid/LedgerGrid.tsx',
  ] as const,
} as const;

/** Staff people pickers that must mount StageStaffAssignPopover, never SearchableSelectField. */
export const STAFF_COMBOBOX_HOSTS = [
  'src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx',
  'src/components/shipped/stacks/MarkAsShippedForm.tsx',
  'src/components/dashboard/BulkAssignDialog.tsx',
] as const;

/**
 * Where each family BINDS to the shared engine — the module that calls
 * {@link useSlotTableLayout}. Shrink-only for "missing" ports; grow when a
 * family opts onto the engine.
 *
 * Two shapes live here while the port runs. The older one is a data-only
 * `use{Family}TableLayout.ts` wrapper; the newer one is a `SlotTableFamily`
 * record in the field catalog, mounted straight from the family's spreadsheet
 * hook (`location-stock`, `sku-bins` — 2026-09-15). The record is the target
 * shape: a wrapper file per family was 47 modules of zero logic, and a family
 * record also feeds the column engine, which the wrapper never could.
 */
export const SLOT_TABLE_ENGINE_LAYOUT_HOOKS: readonly {
  tableId: string;
  path: string;
}[] = [
  { tableId: 'orders', path: 'src/components/dashboard/orders-queue/useOrdersTableLayout.ts' },
  { tableId: 'orders-import', path: 'src/components/outbound/orders/import-staging/useOrdersImportTableLayout.ts' },
  { tableId: 'receiving', path: 'src/components/station/receiving-grid/useReceivingTableLayout.ts' },
  { tableId: 'incoming', path: 'src/components/station/incoming-grid/useIncomingTableLayout.ts' },
  { tableId: 'ready', path: 'src/components/outbound/ready/grid/useReadyTableLayout.ts' },
  { tableId: 'pickup', path: 'src/components/receiving/pickup/grid/usePickupTableLayout.ts' },
  { tableId: 'unfound', path: 'src/components/receiving/unfound/grid/useUnfoundTableLayout.ts' },
  { tableId: 'catalog-link', path: 'src/features/review/catalog-link/grid/useCatalogLinkTableLayout.ts' },
  { tableId: 'import-exception', path: 'src/features/review/catalog-link/grid/useImportExceptionTableLayout.ts' },
  { tableId: 'inventory-units', path: 'src/components/inventory/units-grid/useUnitsTableLayout.ts' },
  { tableId: 'catalog', path: 'src/components/products/catalog/catalog-grid/useCatalogTableLayout.ts' },
  { tableId: 'bins', path: 'src/components/warehouse/bins-grid/useBinsTableLayout.ts' },
  {
    tableId: 'inventory-events',
    path: 'src/components/inventory/events-grid/useInventoryEventsTableLayout.ts',
  },
  { tableId: 'repair', path: 'src/components/repair/repair-grid/useRepairTableLayout.ts' },
  { tableId: 'warranty', path: 'src/components/warranty/grid/useWarrantyTableLayout.ts' },
  { tableId: 'tech-all', path: 'src/components/tech/all/useTechAllTableLayout.ts' },
  { tableId: 'tracking-exceptions', path: 'src/components/tracking-exceptions/grid/useTrackingExceptionsTableLayout.ts' },
  // `tasks` ported to a `SlotTableFamily` record 2026-09-22 (`TASKS_FAMILY`),
  // so it owns neither a layout wrapper nor a column module. Mounted straight
  // from `useTasksSpreadsheet`.
  //
  // `daily` followed the same day when Home's two tabs consolidated into one
  // banded agenda (`DAILY_FAMILY`): the surface calls
  // `useSlotTableLayout(DAILY_FAMILY)` directly, so there is no
  // `useDailyTableLayout.ts` left to name here.
  { tableId: 'my-day', path: 'src/features/my-day/grid/useMyDayTableLayout.ts' },
  {
    tableId: 'kiosk-devices',
    path: 'src/components/settings/kiosk-devices/useKioskDevicesTableLayout.ts',
  },
  {
    tableId: 'kiosk-slot-events',
    path: 'src/components/settings/kiosk-slot-events/useKioskSlotEventsTableLayout.ts',
  },
  {
    tableId: 'walk-in-sales',
    path: 'src/components/walk-in/grid/useWalkInSalesTableLayout.ts',
  },
  {
    tableId: 'tech',
    path: 'src/components/station/bench-grid/useTechTableLayout.ts',
  },
  {
    tableId: 'packer',
    path: 'src/components/station/bench-grid/usePackerTableLayout.ts',
  },
  {
    tableId: 'auth-sessions',
    path: 'src/components/settings/sessions/useAuthSessionsTableLayout.ts',
  },
  {
    tableId: 'cycle-counts',
    path: 'src/components/inventory/cycle-counts/useCycleCountsTableLayout.ts',
  },
  {
    tableId: 'admin-returns',
    path: 'src/components/inventory/returns-grid/useAdminReturnsTableLayout.ts',
  },
  {
    tableId: 'part-compatibility',
    path: 'src/components/admin/sourcing/usePartCompatibilityTableLayout.ts',
  },
  {
    tableId: 'unit-allocations',
    path: 'src/components/inventory/allocations-grid/useUnitAllocationsTableLayout.ts',
  },
  {
    tableId: 'unit-tsn-links',
    path: 'src/components/inventory/tsn-links-grid/useUnitTsnLinksTableLayout.ts',
  },
  {
    tableId: 'audit-log',
    path: 'src/components/settings/audit-log/useAuditLogTableLayout.ts',
  },
  {
    tableId: 'admin-holds',
    path: 'src/components/inventory/holds-grid/useAdminHoldsTableLayout.ts',
  },
  {
    tableId: 'admin-bulk-allocate',
    path: 'src/components/inventory/bulk-allocate-grid/useAdminBulkAllocateTableLayout.ts',
  },
  {
    tableId: 'cycle-count-lines',
    path: 'src/components/inventory/cycle-count-lines/useCycleCountLinesTableLayout.ts',
  },
  {
    tableId: 'admin-drift-alerts',
    path: 'src/components/inventory/drift-grid/useAdminDriftAlertsTableLayout.ts',
  },
  {
    tableId: 'admin-sku-drift',
    path: 'src/components/inventory/drift-grid/useAdminSkuDriftTableLayout.ts',
  },
  {
    tableId: 'staff-directory',
    path: 'src/components/settings/staff-directory/useStaffDirectoryTableLayout.ts',
  },
  {
    tableId: 'report-bin-utilization',
    path: 'src/components/reports/report-bin-utilization-grid/useReportBinUtilizationTableLayout.ts',
  },
  {
    tableId: 'report-velocity',
    path: 'src/components/reports/report-velocity-grid/useReportVelocityTableLayout.ts',
  },
  {
    tableId: 'report-dead-stock',
    path: 'src/components/reports/report-dead-stock-grid/useReportDeadStockTableLayout.ts',
   },
  {
    tableId: 'report-staff-day',
    path: 'src/components/reports/report-staff-day-grid/useReportStaffDayTableLayout.ts',
  },
  {
    tableId: 'report-packer-day',
    path: 'src/components/reports/report-packer-day-grid/useReportPackerDayTableLayout.ts',
  },
  /**
   * No wrapper module: the family RECORD is the registration, mounted straight
   * from the spreadsheet hook (`location-stock` / `sku-bins` precedent).
   */
  {
    tableId: 'report-tasks',
    path: 'src/components/reports/report-tasks-grid/useReportTasksSpreadsheet.ts',
  },
  {
    tableId: 'sku-bins',
    path: 'src/components/inventory/sku-bins-grid/useSkuBinsSpreadsheet.ts',
  },
  {
    tableId: 'location-stock',
    path: 'src/components/inventory/location-stock-grid/useLocationStockSpreadsheet.ts',
  },
  {
    tableId: 'sku-ledger',
    path: 'src/components/inventory/sku-ledger-grid/useSkuLedgerTableLayout.ts',
  },
  {
    tableId: 'sku-allocations',
    path: 'src/components/inventory/sku-allocations-grid/useSkuAllocationsTableLayout.ts',
  },
  {
    tableId: 'search-hits',
    path: 'src/components/search/hits-grid/useSearchHitsTableLayout.ts',
  },
] as const;

/**
 * Existing `*GridRow.tsx` files — shrink-only. A new GridRow is a second table
 * and fails `eval:cohort slot-table`. To-ship sheet sync must not add one;
 * it mounts UnshippedTable. File-CSV may keep CsvImportStagingGridRow until
 * that lane is ported; DashboardOrdersView must not import it for google_sheets.
 */
export const SLOT_TABLE_GRID_ROW_ALLOWLIST = [
  'src/components/inventory/units-grid/UnitsGridRow.tsx',
  'src/components/outbound/orders/import-staging/CsvImportStagingGridRow.tsx',
  'src/components/outbound/ready/grid/ReadyGridRow.tsx',
  'src/components/products/catalog/catalog-grid/CatalogGridRow.tsx',
  'src/components/receiving/unfound/grid/UnfoundGridRow.tsx',
  'src/components/repair/repair-grid/RepairGridRow.tsx',
  'src/components/station/incoming-grid/IncomingGridRow.tsx',
  'src/components/station/receiving-grid/ReceivingGridRow.tsx',
  'src/components/tech/all/TechAllGridRow.tsx',
  'src/components/tracking-exceptions/grid/TrackingExceptionsGridRow.tsx',
  'src/components/warehouse/bins-grid/BinsGridRow.tsx',
  'src/components/warranty/grid/WarrantyGridRow.tsx',
  'src/features/my-day/grid/MyDayGridRow.tsx',
] as const;

/**
 * Per-family COLUMN modules (`*-grid-layout.ts`) — shrink-only, and never
 * again grown.
 *
 * Each of these re-implements the same three engine steps (materialize the
 * skeleton, morph the identity chrome, relabel the data chrome) plus the same
 * four sort functions, so that the family can supply four strings. Measured
 * 2026-09-15 across the 25 canonical peers: every delta against the engine's
 * own output was DATA, and 35 copies of `is{Family}ColumnSortable` were
 * byte-identical. That is why a header-sort change used to land 35 times.
 *
 * The replacement is a {@link SlotTableFamily} record read by
 * `slot-table-columns.ts` — `location-stock` and `sku-bins` are the first two
 * and own no column module at all. Port a family by writing its record and
 * DELETING its line here.
 *
 * The tripwire's contract: the set may never GROW. A new page that adds a
 * `*-grid-layout.ts` fails `eval:cohort slot-table` the day it lands, which
 * is the whole point — standing a table up on a new page must cost a record,
 * not a module.
 */
export const SLOT_TABLE_COLUMN_MODULE_DEBT = [
  'src/components/admin/sourcing/part-compatibility-grid-layout.ts',
  'src/components/inventory/allocations-grid/unit-allocations-grid-layout.ts',
  'src/components/inventory/bulk-allocate-grid/admin-bulk-allocate-grid-layout.ts',
  'src/components/inventory/cycle-count-lines/cycle-count-lines-grid-layout.ts',
  'src/components/inventory/cycle-counts/cycle-counts-grid-layout.ts',
  'src/components/inventory/drift-grid/admin-drift-alerts-grid-layout.ts',
  'src/components/inventory/drift-grid/admin-sku-drift-grid-layout.ts',
  'src/components/inventory/events-grid/inventory-events-grid-layout.ts',
  'src/components/inventory/holds-grid/admin-holds-grid-layout.ts',
  'src/components/inventory/returns-grid/admin-returns-grid-layout.ts',
  'src/components/inventory/sku-ledger-grid/sku-ledger-grid-layout.ts',
  'src/components/inventory/tsn-links-grid/unit-tsn-links-grid-layout.ts',
  'src/components/inventory/units-grid/units-grid-layout.ts',
  'src/components/outbound/orders/import-staging/csv-import-staging-grid-layout.ts',
  'src/components/outbound/ready/grid/ready-grid-layout.ts',
  'src/components/receiving/pickup/grid/pickup-grid-layout.ts',
  'src/components/receiving/unfound/grid/unfound-grid-layout.ts',
  'src/components/reports/report-bin-utilization-grid/report-bin-utilization-grid-layout.ts',
  'src/components/reports/report-dead-stock-grid/report-dead-stock-grid-layout.ts',
  'src/components/reports/report-packer-day-grid/report-packer-day-grid-layout.ts',
  'src/components/reports/report-staff-day-grid/report-staff-day-grid-layout.ts',
  'src/components/reports/report-velocity-grid/report-velocity-grid-layout.ts',
  'src/components/search/hits-grid/search-hits-grid-layout.ts',
  'src/components/settings/audit-log/audit-log-grid-layout.ts',
  'src/components/settings/kiosk-devices/kiosk-devices-grid-layout.ts',
  'src/components/settings/kiosk-slot-events/kiosk-slot-events-grid-layout.ts',
  'src/components/settings/sessions/auth-sessions-grid-layout.ts',
  'src/components/settings/staff-directory/staff-directory-grid-layout.ts',
  'src/components/station/bench-grid/bench-grid-layout.ts',
  'src/components/tracking-exceptions/grid/tracking-exceptions-grid-layout.ts',
  'src/components/walk-in/grid/walk-in-sales-grid-layout.ts',
  'src/components/warehouse/bins-grid/bins-grid-layout.ts',
  'src/components/warranty/grid/warranty-grid-layout.ts',
  'src/features/review/catalog-link/grid/catalog-link-grid-layout.ts',
  'src/features/review/catalog-link/grid/import-exception-grid-layout.ts',
  'src/lib/my-day/my-day-grid-layout.ts',
  'src/lib/products/catalog-grid-layout.ts',
  'src/lib/receiving/receiving-grid-layout.ts',
  'src/lib/repair/repair-grid-layout.ts',
  'src/lib/tech/tech-all-grid-layout.ts',
] as const;

/** Families that own NO column module — the engine paints them from a record. */
export const SLOT_TABLE_COLUMN_ENGINE_FAMILIES = [
  'location-stock',
  'sku-bins',
  'tasks',
  'daily',
] as const;

/** Every product table id — derived, never hand-copied. */
export function slotTablePeerIds(): string[] {
  return PRODUCT_TABLES.map((t) => t.tableId);
}

/** Peers that already mount the shared layout engine. */
export function slotTableEnginePeerIds(): string[] {
  // Two shapes mount the engine: the older `use{Family}TableLayout.ts` wrapper
  // and the newer `SlotTableFamily` record. A record family owns NO wrapper by
  // design, so deriving from the hook list alone reported it as "not on the
  // engine" — the opposite of the truth, and it would have pushed the next
  // agent to re-add the very module the record replaced.
  return [
    ...new Set([
      ...SLOT_TABLE_ENGINE_LAYOUT_HOOKS.map((h) => h.tableId),
      ...SLOT_TABLE_COLUMN_ENGINE_FAMILIES,
    ]),
  ];
}

/**
 * Engine source predicates (paint + seam).
 * Title: idle default + hover accent (never standing always-blue alone).
 * Item-number listing actions: title hover menu, not a subtitle glyph.
 */
/*
 * Retired greps (X1: a seam is proven by an import, a mapping by calling it —
 * `slot-table-cohort.test.ts`): useSlotTableLayoutExport, materializeTracksExport,
 * headerSortLawExport, toolbarSortListsColumnFacts (TS imports);
 * compoundTrackMapsThumb / State / Amount (`queueSortForColumnKey`);
 * headerClickUsesIsSortable (mounted click, LedgerGridColumnHeader.test.ts).
 */
export const SLOT_TABLE_ENGINE_CONTRACT = {
  titleIdleDefault: /text-text-default\s+hover:text-text-info/,
  titleHoverUnderline: /hover:underline/,
  titleItemNumberActions: /Item number actions/,
  editItemNumber: /Edit item number/,
  listingAriaOpen: /Open listing/,
  listingCopyItemNumber: /Copy item number/,
  shipByDateRangeField: /DateRangePickerField/,
  shipByCompactVariant: /variant=["']compact["']/,
  datesCellOrderHash: /glyph=\{Hash\}/,
  datesCellShipByClock: /glyph=\{CalendarClock\}/,
  datesHoverLabel: /compoundDatesHoverLabel/,
  datesClickCursor: /clickCursor/,
  dateFieldCompactDecl: /compact:\s*'ship-by/,
  dateFieldNoYearFace: /format\([^)]*'MMM d'\)/,
  assignOptimistic: /useOptimisticMutation/,
  filterMenuAlwaysMounted: /<DataTableFilterMenu/,
  filterIdleChrome: /DATA_TABLE_FILTER_IDLE/,
  toolbarActionsLeft: /data-testid="data-table-actions"/,
  stageAssignPopover: /StageStaffAssignPopover/,
  stageAssignLock: /canAssignCompoundStage/,
  stageAssignTrigger: /compound-stage-assign-trigger/,
  compoundRowForwardsStageAssigns: /stageAssigns,/,
  stageAssignListHeight: /min-h-56/,
  stageAssignLaneFilter: /staffMatchesStageLane/,
  stageAssignAllStaff: /data-testid="stage-staff-all-staff"/,
  stageAssignRosterSwitch: /data-testid="stage-staff-lane-switch"/,
  lineQtyPin: /pinLineQtyFirst/,
  lineQtyEnsure: /ensureLineQtySubtitle/,
  lineMoneyPin: /pinLineMoneyAfterQty/,
  lineMoneyEnsure: /ensureLineMoneySubtitle/,
  compoundSkeletonNoActions: /A ⋮ `actions` track is/,
  compoundSkeletonNoAmount: /A money `amount`/,
  datesGridLabelDates: /gridLabel:\s*'Dates'/,
  datesDueHover: /COMPOUND_DATES_DUE_HOVER = 'Due date'/,
  datesStartHover: /COMPOUND_DATES_START_HOVER = 'Start date'/,
  datesStartedHoverField: /startedHover\?:/,
  incomingPriceField: /id:\s*'incoming\.price'/,
  receivingPriceField: /id:\s*'receiving\.price'/,
  groupParentSelectChevronBand: /COMPOUND_GUTTER_CHEVRON_BAND_CLASS/,
  leafDetailSelectStack: /data-row-detail/,
  leafDetailBand: /data-compound-row-detail/,
  compoundTwoLineClass: /export const COMPOUND_TWO_LINE_CLASS/,
  headerActionRow: /data-slot-table-action-row/,
  headerActionRowGuest: /empty:hidden/,
  // Contextual select gutter (operator 2026-09-15): status at rest, check on
  // reach, chevron only on hover/open, rail owned by the CELL at full height.
  selectStatusFace: /data-select-status-face/,
  selectStatusHandsBoxBack: /group-hover\/row:opacity-0/,
  selectStatusSharedClock: /edgeMarkFlashOpacity/,
  selectStatusKindFromRail: /kind: edgeMark\.kind/,
  railCellOwned: /data-edge-mark-host/,
  railFullHeight: /absolute inset-y-0 left-0/,
  leafDetailChevronOnReach: /group-hover\/row:opacity-100/,
  selectStatusRotates: /edgeMarkFlashOpacity\(time, FLASH_SEC, index, count\)/,
  parentSelectRestingStatus: /statuses=\{parentStatuses\}/,
  parentFoldChevronOnReach: /group-focus-visible\/group-fold:opacity-100/,
  parentBandStatusRollup: /resolveRowStatus\(row as QueueRowRecord, queueMode\)/,
  gutterContentCentred: /export const COMPOUND_GUTTER_RAIL_INSET_CLASS/,
  gutterMarkTopPin: /export const COMPOUND_GUTTER_MARK_TOP_PIN_CLASS = 'items-start pt-1'/,
  gutterChevronBandDecl: /export const COMPOUND_GUTTER_CHEVRON_BAND_CLASS = 'absolute inset-x-0 bottom-0 h-6'/,
  gutterFaceTopPin: /cn\(COMPOUND_GUTTER_MARK_TOP_PIN_CLASS, COMPOUND_GUTTER_RAIL_INSET_CLASS\)/,
  leafDetailChevronBand: /COMPOUND_GUTTER_CHEVRON_BAND_CLASS/,
  // The fold's TWO marks (operator 2026-09-15): a soft membership rail on the
  // children, a soft close under the group. Neither may be black ink again.
  groupChildRailDecl: /export const SLOT_TABLE_GROUP_CHILD_RAIL_CLASS =\n\s+'pointer-events-none absolute inset-y-0 left-0 w-0\.5 bg-border-default'/,
  groupFoldCloseSoftInk: /export const SLOT_TABLE_GROUP_FOLD_INNER_CLASS =\n\s+'pointer-events-none absolute inset-x-0 bottom-0 z-sticky h-px bg-border-default'/,
  groupChildRailMount: /view\.quietIdentity \? \(\n\s+<span aria-hidden data-group-child-rail=""/,
  rowHoverGroupOnEveryPeer: /'group\/row',/,
} as const;

export type SlotTableEngineContractName = keyof typeof SLOT_TABLE_ENGINE_CONTRACT;

/** Which file each engine-contract predicate greps. Compact ship-by is not CompoundCells-only. */
export function slotTableEngineContractSource(name: SlotTableEngineContractName): string {
  switch (name) {
    case 'dateFieldCompactDecl':
    case 'dateFieldNoYearFace':
      return SLOT_TABLE_ENGINE.dateRangePickerField;
    case 'assignOptimistic':
      return SLOT_TABLE_ENGINE.useOrderAssignment;
    case 'filterMenuAlwaysMounted':
    case 'filterIdleChrome':
    case 'toolbarActionsLeft':
      return SLOT_TABLE_ENGINE.dataTable;
    case 'compoundRowForwardsStageAssigns':
      return SLOT_TABLE_ENGINE.compoundRow;
    case 'stageAssignLaneFilter':
      return SLOT_TABLE_ENGINE.stageStaffAssignPopover;
    case 'stageAssignListHeight':
    case 'stageAssignAllStaff':
    case 'stageAssignRosterSwitch':
      return SLOT_TABLE_ENGINE.assigneeCombobox;
    case 'titleIdleDefault':
    case 'titleHoverUnderline':
      return SLOT_TABLE_ENGINE.productTitleLink;
    case 'lineQtyEnsure':
      return SLOT_TABLE_ENGINE.lineQty;
    case 'lineMoneyEnsure':
    case 'lineMoneyPin':
      return SLOT_TABLE_ENGINE.lineMoney;
    case 'compoundSkeletonNoActions':
    case 'compoundSkeletonNoAmount':
    case 'datesGridLabelDates':
      return SLOT_TABLE_ENGINE.compoundColumns;
    case 'datesDueHover':
    case 'datesStartHover':
    case 'datesStartedHoverField':
      return SLOT_TABLE_ENGINE.compoundRowModel;
    case 'incomingPriceField':
      return SLOT_TABLE_ENGINE.incomingCatalog;
    case 'receivingPriceField':
      return SLOT_TABLE_ENGINE.receivingCatalog;
    case 'groupParentSelectChevronBand':
    case 'parentSelectRestingStatus':
    case 'parentFoldChevronOnReach':
      return SLOT_TABLE_ENGINE.slotTableGroupParentRow;
    case 'parentBandStatusRollup':
      return SLOT_TABLE_ENGINE.ordersQueueGroupRow;
    case 'gutterContentCentred':
    case 'gutterMarkTopPin':
    case 'gutterChevronBandDecl':
    case 'groupChildRailDecl':
    case 'groupFoldCloseSoftInk':
      return SLOT_TABLE_ENGINE.compoundRowChrome;
    case 'gutterFaceTopPin':
      return SLOT_TABLE_ENGINE.compoundCells;
    case 'selectStatusFace':
    case 'selectStatusHandsBoxBack':
    case 'selectStatusSharedClock':
    case 'selectStatusRotates':
      return SLOT_TABLE_ENGINE.compoundSelectStatusFace;
    case 'selectStatusKindFromRail':
      return SLOT_TABLE_ENGINE.compoundSelectStatus;
    case 'railFullHeight':
      return SLOT_TABLE_ENGINE.compoundEdgeRail;
    case 'rowHoverGroupOnEveryPeer':
      return SLOT_TABLE_ENGINE.ledgerGridLeafRow;
    case 'railCellOwned':
    case 'leafDetailChevronOnReach':
      return SLOT_TABLE_ENGINE.compoundGridCell;
    case 'leafDetailSelectStack':
    case 'leafDetailChevronBand':
    case 'groupChildRailMount':
      return SLOT_TABLE_ENGINE.compoundGridCell;
    case 'leafDetailBand':
      return SLOT_TABLE_ENGINE.compoundRowDetailBand;
    case 'compoundTwoLineClass':
      return SLOT_TABLE_ENGINE.compoundCell;
    case 'headerActionRow':
    case 'headerActionRowGuest':
      return SLOT_TABLE_ENGINE.ledgerGrid;
    default:
      return SLOT_TABLE_ENGINE.compoundCells;
  }
}

export type SlotTableGraphSymbol = (typeof SLOT_TABLE_ENGINE.graphSymbols)[number];

/**
 * Engine file each graphSymbols find must hit. CompoundCells is the Item /
 * STATUS pin — not the workspace for DateRangePickerField / DataTableFilterMenu.
 */
export const SLOT_TABLE_GRAPH_SYMBOL_FILES = {
  CompoundItem: SLOT_TABLE_ENGINE.compoundCells,
  CompoundState: SLOT_TABLE_ENGINE.compoundCells,
  useSlotTableLayout: SLOT_TABLE_ENGINE.useSlotTableLayout,
  materializeTracks: SLOT_TABLE_ENGINE.materializeTracks,
  getExternalUrlByItemNumber: SLOT_TABLE_ENGINE.externalItemUrl,
  DateRangePickerField: SLOT_TABLE_ENGINE.dateRangePickerField,
  useOptimisticMutation: SLOT_TABLE_ENGINE.useOptimisticMutation,
  DataTableFilterMenu: SLOT_TABLE_ENGINE.dataTable,
  queueSortForColumnKey: SLOT_TABLE_ENGINE.queueDisplaySort,
  LedgerGridColumnHeader: SLOT_TABLE_ENGINE.ledgerGridColumnHeader,
  isSlotTableChromeTrack: SLOT_TABLE_ENGINE.headerSortLaw,
  AssigneeCombobox: SLOT_TABLE_ENGINE.assigneeCombobox,
  ensureLineQtySubtitle: SLOT_TABLE_ENGINE.lineQty,
  pinLineQtyFirst: SLOT_TABLE_ENGINE.lineQty,
  ensureLineMoneySubtitle: SLOT_TABLE_ENGINE.lineMoney,
  pinLineMoneyAfterQty: SLOT_TABLE_ENGINE.lineMoney,
  ordersCompoundColumnsFor: SLOT_TABLE_ENGINE.ordersLayout,
  COMPOUND_COLUMN_KEYS: SLOT_TABLE_ENGINE.compoundColumns,
  MorphingRowActionMenu: SLOT_TABLE_ENGINE.morphingRowActionMenu,
  // The action-bar HEIGHT law (operator 2026-09-15). Both are in the graph so
  // `impact` names the blast radius before somebody edits the band: the strip
  // cell is shared by four rows, and the guard is the law's runtime half.
  StockStripInput: SLOT_TABLE_ENGINE.stockStripCell,
  useFixedBandHeight: SLOT_TABLE_ENGINE.fixedBandHeight,
  SLOT_TABLE_ID_HEADER_WORD: SLOT_TABLE_ENGINE.idHeaderLaw,
  SLOT_TABLE_IDENTITY_PURITY_LAW: SLOT_TABLE_ENGINE.identityPurityLaw,
} as const satisfies Record<SlotTableGraphSymbol, string>;

export function slotTableGraphSymbolFile(symbol: SlotTableGraphSymbol): string {
  return SLOT_TABLE_GRAPH_SYMBOL_FILES[symbol];
}

export function slotTableGraphExpectedFiles(): Record<string, string> {
  return Object.fromEntries(
    SLOT_TABLE_ENGINE.graphSymbols.map((name) => [name, slotTableGraphSymbolFile(name)]),
  );
}

export type SlotTableEvalManifest = {
  id: 'slot-table';
  label: string;
  ledger: string;
  snapshotsDir: string;
  critiqueFiles: readonly string[];
  graphSymbols: readonly string[];
  graphExpectedFiles: Record<string, string>;
  tripwires: readonly string[];
};

export function slotTableEvalManifest(): SlotTableEvalManifest {
  return {
    id: 'slot-table',
    label: 'Slot data table (engine + PRODUCT_TABLES)',
    ledger: SLOT_TABLE_COHORT_LEDGER,
    snapshotsDir: SLOT_TABLE_COHORT_SNAPSHOTS,
    critiqueFiles: SLOT_TABLE_ENGINE.critiqueFiles,
    graphSymbols: SLOT_TABLE_ENGINE.graphSymbols,
    graphExpectedFiles: slotTableGraphExpectedFiles(),
    tripwires: [
      SLOT_TABLE_COHORT_TRIPWIRE,
      'src/lib/tables/slot-table-line-qty.test.ts',
      'src/lib/tables/slot-table-line-money.test.ts',
      'src/lib/tables/slot-table-session-laws.test.ts',
      'src/lib/tables/slot-table-discover.test.ts',
      // The select gutter's marks, mounted: top-pinned check, chevron band,
      // and the fold's two soft marks (child rail + close).
      'src/components/tables/compound/compound-select-gutter-context.test.ts',
      'src/components/tables/compound/compound-gutter-flush.test.ts',
      // PROPAGATION: the station lanes reach the engine rail through their own
      // dispatcher, so a break there is a cohort break, not an Unbox bug.
      'src/components/station/receiving-grid/cells/receiving-group-child-rail.test.tsx',
      // The engine law around the grid — who may declare a verb, and whether
      // the descriptor has grown a behaviour hook. Same cohort because it is
      // the same SoT: a forked action plane forks the table a page later.
      'src/lib/tables/table-engine-law.test.ts',
      // Industrial cohesion: line count is a metric, while owned chrome/data
      // seams are the actual contract. CLI/MCP/eval share this pure verdict.
      'src/lib/tables/data-table-industrial-law.test.ts',
      // Identity purity: the ID column is strictly for machine handles, never staff names.
      'src/lib/tables/slot-table-identity-purity-law.test.ts',
    ],
  };
}

/** Human-facing paint law for LEDGERs / agents. */
export const SLOT_TABLE_PAINT_LAW = {
  title:
    'CompoundItem title: text-text-default idle; hover/focus text-text-info + underline; optional titleHref opens listing.',
  listingChip:
    'openHref subtitle: ExternalLink glyph (never the word Listing, never item # / host path as face); live text-text-info, missing text-text-faint same box; copy = raw item_number.',
  shipBy:
    'STATUS delay line: DateRangePickerField variant=compact when editable (no X, no year, no presets/Apply, click commits one day). Always a face. Write through useOptimisticMutation (useOrderAssignment). Form compact mounts keep the default calendar.',
  dates:
    'Dates COLUMN header stays Dates on every table (`COMPOUND_TRACKS`). Do not rename it per page. Top line is the start fact (Hash / Start date); bottom line is the deadline (CalendarClock / Due date) OR a secondary temporal face via CompoundDelay.faceLabel when the family has no warehouse deadline (kiosk dwell, enrolled) — never leave `--` on the Calendar line while stuffing that fact into the Hash tip. One glyph each; ink follows the age / faceLabel face — no swap when late. Hover names the line via compoundDatesHoverLabel; portable defaults are Start date / Due date. Family tips that already name the line (Last seen, Enrolled, Ordered, Imported, Opened, Raised, Dwell) own the chip — never prefix Order date. Hash SoT is CompoundRowView.startedHover (parallel to delayTip). CSV/import may still say Ship by date / Order date. Operator 2026-09-11.',
  filter:
    'Toolbar funnel: DataTableFilterMenu always mounts beside SearchField (DATA_TABLE_FILTER_IDLE when a family has no facets). Job verbs (`actions`) paint immediately after the funnel — search · filter · actions · sort · views · date. Never FilterRefinementBar, never a hunt-tile strip, never a funnel inside SearchField. Unbox Queue/Viewed/History share ?ukpi= with KPI tiles via useReceivingTableChrome.',
  headerSort:
    'Every painted DATA column header is click-to-sort (family isSortable + comparator + URL fact map). The toolbar sort menu lists those same facts (`queueColumnSortOptions`) plus View composites / pins — a header-click sort (Pick, Status) must be a selectable row, not trigger-only. Chrome only: select, actions/action, _fill, thumb (Image photo gutter). Header is the Image type glyph on every PRODUCT_TABLES peer and every tab mount; tabs fork row data only — never drop the thumb track. Dead headers (click does nothing) are a fail — map the track, do not mark Status/Item/Order unsortable. There is no Amount column: line money is CompoundItem subtitle identity. Outbound `OrdersGridHost` lanes share `?sort=` via useQueueDisplaySort — do not pass a frozen `sort=` (that was the Shipped / Review / Staged dead-header fork). Operator 2026-09-04: Image/thumb is chrome.',
  stageAssign:
    'Pending stage_event cells (empty dashed mark or assigned-unstamped) open AssigneeCombobox via StageStaffAssignPopover. Assign mode lists this lane only (name-click assigns). All staff (CommandInput trailing) is roster mode: Pick shows Picker, Packed shows Packer, far-right All staff shows both. Stamped steps stay read-only. Hosts arm CompoundStageAssign by catalog field id; CompoundRow forwards stageAssigns so every PRODUCT_TABLES peer that binds a stage track gets the same combo. Bulk assign stays the column-foot person icon. Operator 2026-09-01.',
  lineQty:
    'Line qty is CompoundItem subtitle identity. Catalog `{family}.qty` (number, subtitle) is pinned first under the title on compound (first subtitle track on sheet) via ensureLineQtySubtitle — every PRODUCT_TABLES peer, including a table added later. Not a Qty header between Status and a money column. bins.total_qty is occupancy, not line qty. Face: bare number, widthCh 2, 1 quiet / 2+ warning (lineQtySubtitlePart). Org cannot unbind it. Operator 2026-09-02.',
  lineMoney:
    'Line price/amount is CompoundItem subtitle identity after qty. Catalog `{family}.amount` or `{family}.price` (money, subtitle) is pinned via ensureLineMoneySubtitle — every PRODUCT_TABLES peer, including a table added later. COMPOUND_COLUMN_KEYS has no amount track. Occupancy (sku-velocity.stock, dead-stock.stock) is not line money. catalog.cost is not a line price. Face: COMPOUND_MONEY_TONE_CLASS, widthCh 8, empty `$-` (lineMoneySubtitlePart). Org cannot unbind it. A green Amount column while Unbox still has one is a cohort fail — the 2026-09-04 Orders-only drop was the hole. Operator 2026-09-05.',
  ordersActions:
    'No standing ⋮ on the compound skeleton (`COMPOUND_COLUMN_KEYS` has no actions; `ordersCompoundColumnsFor` never remounts that track). No Amount track on the shared skeleton (`COMPOUND_COLUMN_KEYS` has no amount). Copy order / copy tracking live on CompoundFulfillment chips (click); other row verbs ride the title hover and the checkbox Morphing overlay. Selecting a row ALWAYS opens a sticky action row BELOW the column header (`data-slot-table-action-row` empty:hidden — delete far right, ⋮ more actions) on every outbound OrdersGridHost lane (To-ship AND Shipped — `queueMode` must not disable Morphing). Do not cover or remove the column labels. The guest grows and pushes the sheet; idle it collapses. Click-off to either side does not dismiss it; it stays pinned under the header while the sheet scrolls until the selection is empty. Notes on desktop morphs that row into a one-row composer (`notes-view` + OrderNotesTrail `variant="strip"` — Back + field, no four-row trail). `BottomSheet` `forceVariant="sheet"` + compact trail only on a mobile URL (`/m/` via `isMorphingMobileUrl`). Out of stock morphs the strip (`oos-line` / `oos-kind` / `oos-part` / `oos-confirm`) — shortage identity from listing or kit composition (`/composition`: sku_relationships then sku_kit_parts, never Zoho -P); toast View Pending → `/shipping/shortage`. Paste item # stays Back + SearchField. Do not remount the actions column, a Copy order number row menu, or rowMenuActions on OrdersQueueTableRow. Exceptions: no DataTable `actions=` — Resolve is DeskHeaderAction; Paste item # morphs the checkbox menu (`commitExceptionsItemPaste`). Operator 2026-09-10.',
  groupParentSelect:
    'Multi-line fold parent: the select MARK is pinned to the TOP of the gutter (COMPOUND_GUTTER_MARK_TOP_PIN_CLASS) and the fold chevron paints BELOW it in COMPOUND_GUTTER_CHEVRON_BAND_CLASS — the bottom half of the cell, absolutely positioned, so the mark plane stays the whole cell and the checkbox keeps its hit plane. Same 16px column for both glyphs. Never re-box the check inside a COMPOUND_TWO_LINE_CLASS track (that stack is for TEXT), never float the mark to the middle of the row (operator 2026-09-15 correction: the checklist icon is pinned to the top, the drop-down sits below it), never flex-col justify-center the gutter. Since 2026-09-15 the parent CHECK is the same contextual face as a leaf (`chrome="hover"` + the group\'s rolled-up `statuses`) and the FOLD CHEVRON is hover-ONLY in every state — collapsed AND expanded (operator: "it should not display any collapse state it should only display on hover"), stricter than the leaf detail chevron which stands once open. The band already says it is a fold in words: the identity line counts the boxes ("2 boxes"). The BUTTON keeps its full hit plane and aria-expanded label at every opacity. The band\'s STATUS pill rolls up the same resolver its leaves paint (`resolveRowStatus(row, queueMode)` → statusWordRollup, e.g. "5 OUT OF STOCK") — never a raw `shipment_status` column, which is blank on a shortage and left the band silent under five OUT OF STOCK children. Engine: SlotTableGroupParentRow — To-ship QueueGroupRow and Unbox ReceivingGridGroupRow both mount it. Operator 2026-09-10, revised 2026-09-15.',
  leafDetailSelect:
    'Compound leaf select gutter: when view.detail is present the top-pinned mark (COMPOUND_GUTTER_MARK_TOP_PIN_CLASS) keeps the whole cell as its plane and the detail chevron paints under it in COMPOUND_GUTTER_CHEVRON_BAND_CLASS (data-row-detail — not data-group-fold). EVERY leaf carries it, group CHILD rows included (operator 2026-09-15) — the child drop-down is where child-level detail grows. The chevron is a REACH affordance: closed it paints nothing until row hover / keyboard focus / a no-hover pointer, open it stands (an open leaf detail band is state the glyph is pointing at). The BUTTON keeps its full hit plane and aria-expanded label at every opacity — never gate the control, only the glyph. Chevron expands a second COMPOUND_ROW_PX detail band (serial / location / view unit) under the leaf — never grow the 48px CompoundItem cell, never a third CompoundFulfillment chip. The PARENT fold chevron is stricter — hover-only in both states (see groupParentSelect). Mobile /m uses BottomSheet with the same facts. Virtualizer first-paint uses compoundRowDetailEstimatePx (48 vs 96) + measureElement. Operator 2026-09-11, chevron reveal 2026-09-15.',
  selectGutterStatus:
    'The select gutter is CONTEXTUAL (operator 2026-09-15): at rest the 16px box paints the row\'s triage marks — urgent = Zap in text-text-warning, shortage / exception = AlertTriangle in text-text-danger — and they FLASH on the shared edge-mark clock (edgeMarkFlashOpacity at half the rail period, so every marked row on screen pulses as one). A row that is BOTH urgent and short carries TWO marks and the box ALTERNATES between them (one layer per mark, `index` / `count` slots, only one visible at a time) — never two glyphs side by side, never a single "worst" mark that hides the other fact. Reduced motion stands the hottest mark still. Row hover / keyboard focus on the checkbox / `(hover: none)` hands the same box back to GridSelectSquareFace; a ticked row keeps the accent square at every pointer position. Ordinary rows stay EMPTY — never restore a resting glyph on every row (2026-09-04). CENTRING (operator 2026-09-15, "displayed centered in the middle"): gutter content — check, status glyph, chevron — is `items-center` and reserves the rail via COMPOUND_GUTTER_RAIL_INSET_CLASS on EVERY row, so the marks read as one centre line down a 24px track instead of crowding the 3px bar; the 2026-09-04 `items-start pt-1` top-bias is retired for the compound gutter (flat grids keep it). Resolver: compoundSelectStatusMarks (heat-ordered: urgent rail, then attention rail or itemStatus — never the same kind twice); face: CompoundSelectStatusFace. The leading RAIL belongs to the gutter CELL (`data-edge-mark-host` + `relative`), full COMPOUND_ROW_PX, width from COMPOUND_EDGE_RAIL_CLASS — never painted inside CompoundSelect; colour is the hottest fact (urgent yellow, shortage / exception rose, both pulsing). `group/row` is declared by LedgerGridLeafRow, OrdersQueueTableRow and SlotTableGroupParentRow so the swap works on every PRODUCT_TABLES peer and on fold parents, which report the group rollup.',
  personFace:
    'displayType person paints StaffAvatar (profile mark) + staff name. Resolver returns kind:person { staffId, name }. Never Staff #id, never bare numeric staff id as the face text. Empty when neither name nor id. CompoundSlotCell mounts StaffAvatar size xs beside a truncated name. Every PRODUCT_TABLES peer that binds a person field inherits this face — kiosk-devices.enrolled_by, tracking-exceptions.staff, and any later person binding. Operator 2026-09-11.',
  staffCombo:
    'Every staff combobox is AssigneeCombobox via StageStaffAssignPopover. Rows paint StaffAvatar (profile mark) + name (leading). Never SearchableSelectField for people — that list is name + role meta, no PFP. role=all + onCommit is full-roster assign (scan-out strip). role=all without onCommit is roster switches. Operator 2026-09-11.',
  last8Digits:
    'Digit faces in the slot data table are LAST-8, as a hard law (operator 2026-09-14). Every tracking / PO / order / serial / item-number chip paints getLast8(value) — the face is the final eight characters, mono; the full value lives on hover and click-to-copy (copy-chip-format SoT). TrackingChip/TrackingOrSkuScanChip/PoChip/OrderNumberMenuChip already derive it — never pass a raw multi-digit value as a chip display or plain-text face on any PRODUCT_TABLES peer; a new face that shows more than the last 8 digits of a long id is a cohort fail. Multi-line fold BANDS paint the plain (glyph-less) chip face — no `#` icon on the group band.',
  groupFoldMembership:
    'A multi-line fold speaks with TWO marks, and they are not interchangeable. MEMBERSHIP (open state): every group child wears SLOT_TABLE_GROUP_CHILD_RAIL_CLASS — a 2px `w-0.5 bg-border-default` rail, absolute on the IDENTITY track\'s leading edge (x 24, clear of the 3px triage rail; inside the frozen prefix so it cannot shear). Mounted ONCE in renderCompoundGridCell and gated on CompoundRowView.quietIdentity (the group-child marker), never on a family name — To-ship, Unbox and Incoming inherit it. Never put it in the select gutter: the first 3px there are CompoundEdgeRail, which is per-row and conditional, so the same slot would mean "urgent" on one row and "child" on the next. CLOSE (both states): SLOT_TABLE_GROUP_FOLD_INNER_CLASS, now `bg-border-default` — operator 2026-09-15 retired the black `bg-text-default` rule ("instead of a black line displaying below the line"), which superseded the 2026-09-14 "black and more visible" ruling; that ink was only load-bearing while the close was the ONLY evidence a group existed. A full-bleed text-ink rule is the spreadsheet TOTALS idiom. Never restore the 4-side envelope or the inner box, never paint a second bar, and never drop the close — collapsed folds have no children to carry the rail.',
  scope: 'Engine paint for every PRODUCT_TABLES peer — not To-ship alone.',
} as const;
