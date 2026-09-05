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
  materializeTracks: 'src/lib/tables/materialize-tracks.ts',
  externalItemUrl: 'src/utils/external-item-url.ts',
  dateRangePickerField: 'src/design-system/components/DateRangePickerField.tsx',
  useOrderAssignment: 'src/hooks/useOrderAssignment.ts',
  useOptimisticMutation: 'src/lib/optimistic/useOptimisticMutation.ts',
  dataTable: 'src/components/tables/DataTable.tsx',
  queueDisplaySort: 'src/utils/queue-display-sort.ts',
  headerSortLaw: 'src/lib/tables/slot-table-header-sort.ts',
  ledgerGridColumnHeader: 'src/design-system/components/grid/LedgerGridColumnHeader.tsx',
  lineQty: 'src/lib/tables/slot-table-line-qty.ts',
  ordersLayout: 'src/lib/dashboard-order-row-layout.ts',
  ordersQueueRow: 'src/components/dashboard/orders-queue/OrdersQueueTableRow.tsx',
  compoundColumns: 'src/components/tables/compound/compound-columns.ts',
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
    'ordersCompoundColumnsFor',
    'COMPOUND_COLUMN_KEYS',
  ] as const,
  critiqueFiles: [
    'src/components/tables/compound/CompoundCells.tsx',
    'src/components/tables/compound/CompoundRow.tsx',
    'src/components/tables/compound/StageStaffAssignPopover.tsx',
    'src/design-system/components/AssigneeCombobox.tsx',
    'src/components/tables/compound/CompoundStaffRosterButton.tsx',
    'src/design-system/components/DateRangePickerField.tsx',
    'src/components/tables/useSlotTableLayout.ts',
    'src/utils/external-item-url.ts',
    'src/components/tables/DataTable.tsx',
    'src/design-system/components/grid/LedgerGridColumnHeader.tsx',
  ] as const,
} as const;

/**
 * Layout hooks that wrap {@link useSlotTableLayout}. Shrink-only for "missing"
 * ports; grow when a family opts onto the engine.
 */
export const SLOT_TABLE_ENGINE_LAYOUT_HOOKS: readonly {
  tableId: string;
  path: string;
}[] = [
  { tableId: 'orders', path: 'src/components/dashboard/orders-queue/useOrdersTableLayout.ts' },
  { tableId: 'orders-import', path: 'src/components/outbound/orders/import-staging/useOrdersImportTableLayout.ts' },
  {
    tableId: 'shortage-coverage-import',
    path: 'src/components/outbound/orders/shortage-coverage-staging/useShortageCoverageImportTableLayout.ts',
  },
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
  { tableId: 'tasks', path: 'src/features/tasks/grid/useTasksTableLayout.ts' },
  { tableId: 'sessions', path: 'src/features/reports/sessions/useSessionsTableLayout.ts' },
  { tableId: 'sku-velocity', path: 'src/features/reports/metrics/useSkuVelocityTableLayout.ts' },
  { tableId: 'dead-stock', path: 'src/features/reports/metrics/useDeadStockTableLayout.ts' },
  { tableId: 'daily', path: 'src/features/home/grid/useDailyTableLayout.ts' },
  { tableId: 'my-day', path: 'src/features/my-day/grid/useMyDayTableLayout.ts' },
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
  'src/components/outbound/orders/shortage-coverage-staging/ShortageCoverageStagingGridRow.tsx',
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

/** Every product table id — derived, never hand-copied. */
export function slotTablePeerIds(): string[] {
  return PRODUCT_TABLES.map((t) => t.tableId);
}

/** Peers that already mount the shared layout engine. */
export function slotTableEnginePeerIds(): string[] {
  return [...new Set(SLOT_TABLE_ENGINE_LAYOUT_HOOKS.map((h) => h.tableId))];
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
  ordersDropActionsTrack: /c\.key !== 'amount'/,
  compoundSkeletonNoActions: /A ⋮ `actions` track is/,
  compoundKeysAmountThenFill: /'amount',\n  '_fill',/,
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
    case 'ordersDropActionsTrack':
      return SLOT_TABLE_ENGINE.ordersLayout;
    case 'compoundSkeletonNoActions':
    case 'compoundKeysAmountThenFill':
      return SLOT_TABLE_ENGINE.compoundColumns;
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
  ordersCompoundColumnsFor: SLOT_TABLE_ENGINE.ordersLayout,
  COMPOUND_COLUMN_KEYS: SLOT_TABLE_ENGINE.compoundColumns,
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
      'src/lib/tables/slot-table-discover.test.ts',
      // The engine law around the grid — who may declare a verb, and whether
      // the descriptor has grown a behaviour hook. Same cohort because it is
      // the same SoT: a forked action plane forks the table a page later.
      'src/lib/tables/table-engine-law.test.ts',
      'src/lib/eval/find-freshness.test.ts',
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
    'STATUS delay line: DateRangePickerField variant=compact when editable (no X, no year, no presets/Apply, click commits one day). Always a face. Write through useOptimisticMutation (useOrderAssignment). DATES glyphs: Hash on order date, CalendarClock on due date; one glyph, ink follows the age face (no swap when late). Hover always names the line (`Order date` / `Due date`) via HoverTooltip so MorphCursorLayer carries the chip; clickCursor on the compact trigger. Form compact mounts keep the default calendar.',
  filter:
    'Toolbar funnel: DataTableFilterMenu always mounts beside SearchField (DATA_TABLE_FILTER_IDLE when a family has no facets). Job verbs (`actions`) paint immediately after the funnel — search · filter · actions · sort · views · date. Never FilterRefinementBar, never a hunt-tile strip, never a funnel inside SearchField. Unbox Queue/Viewed/History share ?ukpi= with KPI tiles via useReceivingTableChrome.',
  headerSort:
    'Every painted DATA column header is click-to-sort (family isSortable + comparator + URL fact map). The toolbar sort menu lists those same facts (`queueColumnSortOptions`) plus View composites / pins — a header-click sort (Pick, Status) must be a selectable row, not trigger-only. Chrome only: select, actions/action, _fill, thumb (Image photo gutter). Header is the Image type glyph on every PRODUCT_TABLES peer and every tab mount; tabs fork row data only — never drop the thumb track. Dead headers (click does nothing) are a fail — map the track, do not mark Status/Amount/Item/Order unsortable. Outbound `OrdersGridHost` lanes share `?sort=` via useQueueDisplaySort — do not pass a frozen `sort=` (that was the Shipped / Review / Staged dead-header fork). Operator 2026-09-04: Image/thumb is chrome.',
  stageAssign:
    'Pending stage_event cells (empty dashed mark or assigned-unstamped) open AssigneeCombobox via StageStaffAssignPopover. Assign mode lists this lane only (name-click assigns). All staff (CommandInput trailing) is roster mode: Pick shows Picker, Packed shows Packer, far-right All staff shows both. Stamped steps stay read-only. Hosts arm CompoundStageAssign by catalog field id; CompoundRow forwards stageAssigns so every PRODUCT_TABLES peer that binds a stage track gets the same combo. Bulk assign stays the column-foot person icon. Operator 2026-09-01.',
  lineQty:
    'Line qty is CompoundItem subtitle identity. Catalog `{family}.qty` (number, subtitle) is pinned first under the title on compound (first subtitle track on sheet) via ensureLineQtySubtitle — every PRODUCT_TABLES peer, including a table added later. Not a Qty header between Status and Amount. bins.total_qty is occupancy, not line qty. Face: bare number, widthCh 2, 1 quiet / 2+ warning (lineQtySubtitlePart). Org cannot unbind it. Operator 2026-09-02.',
  ordersActions:
    'No standing ⋮ on the compound skeleton (`COMPOUND_COLUMN_KEYS` has no actions). `ordersCompoundColumnsFor` drops amount only. Copy order / copy tracking live on CompoundFulfillment chips (click); other row verbs ride the title hover and the checkbox Morphing menu. Selecting a row ALWAYS opens that left manifold on every outbound OrdersGridHost lane (To-ship AND Shipped — `queueMode` must not disable Morphing). Do not remount the actions column, a Copy order number row menu, or rowMenuActions on OrdersQueueTableRow. Exceptions: no DataTable `actions=` — Resolve is DeskHeaderAction; Paste item # morphs the checkbox menu (`commitExceptionsItemPaste`). Operator 2026-09-04.',
  scope: 'Engine paint for every PRODUCT_TABLES peer — not To-ship alone.',
} as const;
