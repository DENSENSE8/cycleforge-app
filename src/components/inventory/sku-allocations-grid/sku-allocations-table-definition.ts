/**
 * `unit-allocations.sku` — the per-SKU allocations table definition.
 *
 * The SECOND mount of the `unit-allocations` family, and it mints nothing: the
 * catalog, the resolver, the adapter, the column materializer, the column TYPE
 * and the capabilities are all that family's, by reference. What is new here is
 * a definition id, a prefs bucket (`sku-allocations` — see
 * `field-catalog/sku-allocations-layout.ts` for why the two feeds cannot share
 * one document) and a RECORD PLANE, which is genuinely different per desk:
 *
 * - the unit desk's rows are orders, and no route opens one order, so its
 *   binding declares `kind: 'none'`.
 * - these rows are UNITS of the SKU the page is about, and
 *   `/inventory?unit=<id>` is a real desk record route — the retired
 *   cell's `<Link>`. So the reach-through survives as a ROW OPEN.
 *
 * A second definition is the ONLY lawful way to say that: `recordPlane` lives
 * on the binding, and `table-record-plane.guard.test.ts` refuses two bindings
 * that share one tableId.
 */

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

/**
 * Build the descriptor from a RESOLVED column list (post-visibility), so
 * `contentMinWidthRem` and the TanStack defs follow the tracks that actually
 * render. `columns` is REQUIRED: a module-constant default is the
 * `grid-default` debt the discover scanner deletes.
 */
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
  /**
   * The retired `unit` cell's `<Link href="/inventory?unit=<id>">`, as a
   * declared reach-through: the row opens the UNIT that is holding this SKU's
   * stock, which is the one document a row here maps onto one-for-one. The
   * mount supplies the only thing a binding cannot hold — the router
   * (`SkuDetailTables`), exactly as the returns dock does.
   *
   * Not the ORDER: there is no desk route for one order (To-ship is a queue),
   * which is why the unit-detail mount of this same family declares
   * `kind: 'none'`. One entity, two desks, two honest answers.
   */
  recordPlane: {
    kind: 'navigate',
    reason:
      "The retired Unit cell linked to /inventory?unit=<id>; a row here maps one-for-one onto that unit's record route, so the reach-through survives as a row open rather than a link inside a cell.",
  },
};
