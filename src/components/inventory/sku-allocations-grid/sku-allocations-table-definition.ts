/** `unit-allocations.sku` — the per-SKU allocations table definition. */

import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import {
  makeGridSurfaceDescriptor,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { UnitAllocationTableRow } from '@/lib/inventory/unit-allocation-row';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import { SKU_ALLOCATIONS_PRODUCT_LAYOUT } from '@/lib/tables/field-catalog/sku-allocations-layout';
import {
  defaultDirForUnitAllocationsColumn,
  isUnitAllocationsColumnSortable,
  unitAllocationsCompoundColumnsFor,
  type UnitAllocationsGridColumn,
} from '@/components/inventory/allocations-grid/unit-allocations-grid-layout';
import { UNIT_ALLOCATIONS_GRID_CAPABILITIES } from '@/components/inventory/allocations-grid/unit-allocations-table-definition';

/**
 * This mount's PRODUCT-DEFAULT materialization — the same materializer over
 * this desk's layout document. `unitAllocationsCompoundColumnsFor` reads the
 * layout it is handed precisely so this file needs no edit to that one.
 */
export const SKU_ALLOCATIONS_COMPOUND_COLUMNS: readonly UnitAllocationsGridColumn[] =
  unitAllocationsCompoundColumnsFor(SKU_ALLOCATIONS_PRODUCT_LAYOUT);

/** Build the descriptor from a RESOLVED column list (post-visibility), so `contentMinWidthRem` and the TanStack defs follow the tracks that… */
export function makeSkuAllocationsGridDescriptor(
  columns: readonly UnitAllocationsGridColumn[],
): GridSurfaceDescriptor<UnitAllocationTableRow, UnitAllocationsGridColumn> {
  return makeGridSurfaceDescriptor<UnitAllocationTableRow, UnitAllocationsGridColumn>(
    'unit-allocations.sku',
    columns,
    {
      isSortable: (key) => isUnitAllocationsColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForUnitAllocationsColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    UNIT_ALLOCATIONS_GRID_CAPABILITIES,
  );
}

/**
 * Validated at module load: a definition that violates a structural law throws
 * here rather than painting a broken grid.
 */
export const SKU_ALLOCATIONS_TABLE_DEFINITION = parseTableDefinition({
  id: 'unit-allocations.sku',
  tableId: 'sku-allocations',
  entityFamily: 'unit-allocations',
  cellMapKey: 'unit-allocations',
  ariaLabel: 'Open allocations',
  testId: 'sku-allocations-grid-body',
  surface: 'sheet',
  // A handful of open holds on one SKU; a sticky day band per allocation stamp
  // would be one band per row.
  showDayHeaders: false,
  capabilities: UNIT_ALLOCATIONS_GRID_CAPABILITIES,
  columns: SKU_ALLOCATIONS_COMPOUND_COLUMNS,
});

export const SKU_ALLOCATIONS_TABLE_BINDING: TableSurfaceBinding<
  UnitAllocationTableRow,
  UnitAllocationsGridColumn
> = {
  definition: SKU_ALLOCATIONS_TABLE_DEFINITION,
  columns: SKU_ALLOCATIONS_COMPOUND_COLUMNS,
  makeDescriptor: makeSkuAllocationsGridDescriptor,
  /** The retired `unit` cell's `<Link href="/inventory?unit=<id>">`, as a declared reach-through: */
  recordPlane: {
    kind: 'navigate',
    reason:
      "The retired Unit cell linked to /inventory?unit=<id>; a row here maps one-for-one onto that unit's record route, so the reach-through survives as a row open rather than a link inside a cell.",
  },
};
