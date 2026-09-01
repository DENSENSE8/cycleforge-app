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
  useSlotTableLayout: 'src/components/tables/useSlotTableLayout.ts',
  materializeTracks: 'src/lib/tables/materialize-tracks.ts',
  externalItemUrl: 'src/utils/external-item-url.ts',
  dateRangePickerField: 'src/design-system/components/DateRangePickerField.tsx',
  useOrderAssignment: 'src/hooks/useOrderAssignment.ts',
  dataTable: 'src/components/tables/DataTable.tsx',
  graphSymbols: [
    'CompoundItem',
    'CompoundState',
    'useSlotTableLayout',
    'materializeTracks',
    'getExternalUrlByItemNumber',
    'DateRangePickerField',
    'useOptimisticMutation',
    'DataTableFilterMenu',
  ] as const,
  critiqueFiles: [
    'src/components/tables/compound/CompoundCells.tsx',
    'src/design-system/components/DateRangePickerField.tsx',
    'src/components/tables/useSlotTableLayout.ts',
    'src/utils/external-item-url.ts',
    'src/components/tables/DataTable.tsx',
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
  { tableId: 'repair', path: 'src/components/repair/repair-grid/useRepairTableLayout.ts' },
  { tableId: 'warranty', path: 'src/components/warranty/grid/useWarrantyTableLayout.ts' },
  { tableId: 'tech-all', path: 'src/components/tech/all/useTechAllTableLayout.ts' },
  { tableId: 'tracking-exceptions', path: 'src/components/tracking-exceptions/grid/useTrackingExceptionsTableLayout.ts' },
  { tableId: 'tasks', path: 'src/features/tasks/grid/useTasksTableLayout.ts' },
  { tableId: 'daily', path: 'src/features/home/grid/useDailyTableLayout.ts' },
  { tableId: 'my-day', path: 'src/features/my-day/grid/useMyDayTableLayout.ts' },
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
 * Listing chip: fixed "Listing" word + fixed width class.
 */
export const SLOT_TABLE_ENGINE_CONTRACT = {
  titleIdleDefault: /text-text-default\s+hover:text-text-info/,
  titleHoverUnderline: /hover:underline/,
  listingGlyph: /ExternalLink/,
  listingAriaOpen: /Open listing/,
  listingCopyItemNumber: /Copy item number/,
  shipByDateRangeField: /DateRangePickerField/,
  shipByCompactVariant: /variant=["']compact["']/,
  dateFieldCompactDecl: /compact:\s*'ship-by/,
  dateFieldNoYearFace: /format\([^)]*'MMM d'\)/,
  assignOptimistic: /useOptimisticMutation/,
  useSlotTableLayoutExport: /export function useSlotTableLayout/,
  materializeTracksExport: /export function materializeTracks/,
  filterMenuAlwaysMounted: /<DataTableFilterMenu/,
  filterIdleChrome: /DATA_TABLE_FILTER_IDLE/,
} as const;

export type SlotTableEngineContractName = keyof typeof SLOT_TABLE_ENGINE_CONTRACT;

/** Which file each engine-contract predicate greps. Compact ship-by is not CompoundCells-only. */
export function slotTableEngineContractSource(name: SlotTableEngineContractName): string {
  switch (name) {
    case 'useSlotTableLayoutExport':
      return SLOT_TABLE_ENGINE.useSlotTableLayout;
    case 'materializeTracksExport':
      return SLOT_TABLE_ENGINE.materializeTracks;
    case 'dateFieldCompactDecl':
    case 'dateFieldNoYearFace':
      return SLOT_TABLE_ENGINE.dateRangePickerField;
    case 'assignOptimistic':
      return SLOT_TABLE_ENGINE.useOrderAssignment;
    case 'filterMenuAlwaysMounted':
    case 'filterIdleChrome':
      return SLOT_TABLE_ENGINE.dataTable;
    default:
      return SLOT_TABLE_ENGINE.compoundCells;
  }
}

export type SlotTableEvalManifest = {
  id: 'slot-table';
  label: string;
  ledger: string;
  snapshotsDir: string;
  critiqueFiles: readonly string[];
  graphSymbols: readonly string[];
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
    tripwires: [
      SLOT_TABLE_COHORT_TRIPWIRE,
      'src/lib/tables/slot-table-discover.test.ts',
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
    'STATUS delay line: DateRangePickerField variant=compact when editable (no X, no year, no presets/Apply, click commits one day). Always a face. Write through useOptimisticMutation (useOrderAssignment).',
  filter:
    'Toolbar funnel: DataTableFilterMenu always mounts beside SearchField (DATA_TABLE_FILTER_IDLE when a family has no facets). Never FilterRefinementBar, never a hunt-tile strip, never a funnel inside SearchField. Unbox Queue/Viewed/History share ?ukpi= with KPI tiles via useReceivingTableChrome.',
  scope: 'Engine paint for every PRODUCT_TABLES peer — not To-ship alone.',
} as const;
