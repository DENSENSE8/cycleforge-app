/**
 * `location-stock.desk` — the stock-by-location table definition, capabilities
 * and surface descriptor.
 *
 * Re-declares nothing: the column model, the sort law and the default
 * direction are the ENGINE's (`slot-table-columns.ts`) read through this
 * family's record, and the canonical columns are the product-default
 * MATERIALIZATION — never a hand array, and no longer a per-family copy of
 * the materializer either.
 */

import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import {
  defaultDirForSlotTableColumn,
  isSlotTableColumnSortable,
  slotTableColumnsFor,
  type SlotTableColumn,
} from '@/components/tables/compound/slot-table-columns';
import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { LocationStockTableRow } from '@/lib/inventory/location-stock-row';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  LOCATION_STOCK_FAMILY,
  LOCATION_STOCK_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/location-stock';

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const LOCATION_STOCK_COMPOUND_COLUMNS: readonly SlotTableColumn[] = slotTableColumnsFor(
  LOCATION_STOCK_FAMILY,
  LOCATION_STOCK_PRODUCT_LAYOUT,
);

/**
 * A read list that grew VERBS (2026-09-15), so the select gutter is live.
 *
 * It shipped with `multiSelect: false` and a note saying the gutter checkbox
 * "would be a control with no verb behind it" — true while `bin_contents` was
 * only ever written by the stations that scan it. The action strip supplies
 * the verbs an operator asked for at a desk (adjust the count, move a SKU to
 * another location, remove the pairing), and each one acts on a SELECTION, so
 * the flag and the comment both flip here rather than a checkbox appearing
 * beside a docblock that argues against it.
 *
 * `inCellEdit` stays off: a count is a ledger write with a reason code, not a
 * cell that accepts a number. See `StockActionBar`.
 */
export const LOCATION_STOCK_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

/**
 * Build the descriptor from a RESOLVED column list (post-visibility), so
 * `contentMinWidthRem` and the TanStack defs follow the tracks that actually
 * render. `columns` is REQUIRED: a module-constant default is the
 * `grid-default` debt the discover scanner deletes.
 */
export function makeLocationStockGridDescriptor(
  columns: readonly SlotTableColumn[],
): GridSurfaceDescriptor<LocationStockTableRow, SlotTableColumn> {
  return makeGridSurfaceDescriptor<LocationStockTableRow, SlotTableColumn>(
    'location-stock.desk',
    columns,
    {
      isSortable: (key) => isSlotTableColumnSortable(LOCATION_STOCK_FAMILY, columns, key),
      sortDescFirst: (key) =>
        defaultDirForSlotTableColumn(LOCATION_STOCK_FAMILY, columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    LOCATION_STOCK_GRID_CAPABILITIES,
  );
}

/**
 * Validated at module load: a definition that violates a structural law throws
 * here rather than painting a broken grid.
 */
export const LOCATION_STOCK_TABLE_DEFINITION = parseTableDefinition({
  id: 'location-stock.desk',
  tableId: 'location-stock',
  entityFamily: 'location-stock',
  cellMapKey: 'location-stock',
  ariaLabel: 'Stock by location',
  testId: 'location-stock-grid-body',
  surface: 'sheet',
  // The stamp on a row is a COUNT date, not an arrival, and the list is walked
  // by room rather than by day: a sticky day band would band by the accident of
  // when somebody last counted the shelf.
  showDayHeaders: false,
  capabilities: LOCATION_STOCK_GRID_CAPABILITIES,
  columns: LOCATION_STOCK_COMPOUND_COLUMNS,
});

export const LOCATION_STOCK_TABLE_BINDING: TableSurfaceBinding<
  LocationStockTableRow,
  SlotTableColumn
> = {
  definition: LOCATION_STOCK_TABLE_DEFINITION,
  columns: LOCATION_STOCK_COMPOUND_COLUMNS,
  makeDescriptor: makeLocationStockGridDescriptor,
  /**
   * HONEST ABSENCE, ruled rather than defaulted — the same ruling `sku-bins`
   * carries, for the same reason. No route opens one (location, sku) PAIR: the
   * floor tool for a bin is keyed by location (`/inventory/location/[barcode]`)
   * and the desk record for a product is keyed by SKU
   * (`/inventory/health/sku/[sku]`), so a plane here would have to pick one
   * half of the row's identity and drop the other.
   *
   * It becomes `navigate` the day a pair has a record of its own.
   */
  recordPlane: {
    kind: 'none',
    reason:
      'A row is a (location, sku) pair. The bin has a floor route keyed by barcode and the product has a desk route keyed by SKU; neither opens the pair, and a plane would have to drop half the row identity.',
  },
};
