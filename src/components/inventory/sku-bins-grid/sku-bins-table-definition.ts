/** `sku-bins.sku` — the per-SKU bin-distribution table definition, capabilities and surface descriptor. */

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

/** A READ pane on a detail page. */
export const SKU_BINS_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

/** Build the descriptor from a RESOLVED column list (post-visibility), so `contentMinWidthRem` and the TanStack defs follow the tracks that… */
function makeSkuBinsGridDescriptor(
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
const SKU_BINS_TABLE_DEFINITION = parseTableDefinition({
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
  /** HONEST ABSENCE, ruled rather than defaulted. */
  recordPlane: {
    kind: 'none',
    reason:
      'A pane on the per-SKU operations page. The retired cell linked nowhere, and no route opens one (sku, bin) pair — the warehouse map is keyed by location, not by the pair this row is.',
  },
};
