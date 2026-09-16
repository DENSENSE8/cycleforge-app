/**
 * `sku-bins.sku` — the per-SKU bin-distribution table definition, capabilities
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
import type { SkuBinTableRow } from '@/lib/inventory/sku-bin-row';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import { SKU_BINS_FAMILY, SKU_BINS_PRODUCT_LAYOUT } from '@/lib/tables/field-catalog/sku-bins';

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const SKU_BINS_COMPOUND_COLUMNS: readonly SlotTableColumn[] = slotTableColumnsFor(
  SKU_BINS_FAMILY,
  SKU_BINS_PRODUCT_LAYOUT,
);

/**
 * A READ pane on a detail page. Moving stock between bins happens at the floor
 * stations that scan it (`bin_contents` is written by counts and moves, never
 * by an admin form), so there is no verb here and `multiSelect` stays off: the
 * gutter checkbox would be a control with no verb behind it.
 */
export const SKU_BINS_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
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
export function makeSkuBinsGridDescriptor(
  columns: readonly SlotTableColumn[],
): GridSurfaceDescriptor<SkuBinTableRow, SlotTableColumn> {
  return makeGridSurfaceDescriptor<SkuBinTableRow, SlotTableColumn>(
    'sku-bins.sku',
    columns,
    {
      isSortable: (key) => isSlotTableColumnSortable(SKU_BINS_FAMILY, columns, key),
      sortDescFirst: (key) => defaultDirForSlotTableColumn(SKU_BINS_FAMILY, columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    SKU_BINS_GRID_CAPABILITIES,
  );
}

/**
 * Validated at module load: a definition that violates a structural law throws
 * here rather than painting a broken grid.
 */
export const SKU_BINS_TABLE_DEFINITION = parseTableDefinition({
  id: 'sku-bins.sku',
  tableId: 'sku-bins',
  entityFamily: 'sku-bins',
  cellMapKey: 'sku-bins',
  ariaLabel: 'Bin distribution',
  testId: 'sku-bins-grid-body',
  surface: 'sheet',
  // A SKU lives in a handful of bins and the stamp on the row is a COUNT date,
  // not an arrival: a sticky day band per count would be one band per row.
  showDayHeaders: false,
  capabilities: SKU_BINS_GRID_CAPABILITIES,
  columns: SKU_BINS_COMPOUND_COLUMNS,
});

export const SKU_BINS_TABLE_BINDING: TableSurfaceBinding<SkuBinTableRow, SlotTableColumn> = {
  definition: SKU_BINS_TABLE_DEFINITION,
  columns: SKU_BINS_COMPOUND_COLUMNS,
  makeDescriptor: makeSkuBinsGridDescriptor,
  /**
   * HONEST ABSENCE, ruled rather than defaulted. The retired cell linked
   * nowhere — it printed the bin's handle as plain mono text — and a bin's own
   * record lives on the warehouse map (`/warehouse`), which is a floor tool
   * keyed by location, not a desk record plane for a (sku, bin) PAIR. There is
   * no route that opens "this SKU in this bin", and stacking a plane over the
   * page this pane is part of to restate three numbers already on the row would
   * be a record plane with no record in it.
   *
   * It becomes `navigate` the day a bin detail route exists.
   */
  recordPlane: {
    kind: 'none',
    reason:
      'A pane on the per-SKU operations page. The retired cell linked nowhere, and no route opens one (sku, bin) pair — the warehouse map is keyed by location, not by the pair this row is.',
  },
};
