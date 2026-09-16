/**
 * `unit-allocations.unit` — the unit-detail allocations table definition,
 * capabilities and surface descriptor.
 *
 * Re-declares nothing: columns + capabilities are the family SoT by reference,
 * and the canonical columns are the product-default MATERIALIZATION
 * (`UNIT_ALLOCATIONS_COMPOUND_COLUMNS`), never a hand array.
 *
 * The per-SKU allocations mount (a later brief) declares its OWN definition id
 * against this same family — `unit-allocations.sku` on a sibling layout
 * document if the operator wants different defaults there, which is the
 * `incoming` / `receiving` shape. It reuses the catalog, the resolver and the
 * adapter; what it must not do is mint a second allocations vocabulary.
 */

import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { UnitAllocationTableRow } from '@/lib/inventory/unit-allocation-row';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  UNIT_ALLOCATIONS_COMPOUND_COLUMNS,
  defaultDirForUnitAllocationsColumn,
  isUnitAllocationsColumnSortable,
  type UnitAllocationsGridColumn,
} from './unit-allocations-grid-layout';

/**
 * A READ pane on a detail page. Allocating and releasing a unit happen through
 * `/api/serial-units/[id]/allocate` from the stations that own those decisions,
 * not from a cell on the unit's own history — so there is no verb here and
 * `multiSelect` stays off: the gutter checkbox would be a control with no verb
 * behind it.
 */
export const UNIT_ALLOCATIONS_GRID_CAPABILITIES: GridSurfaceCapabilities = {
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
export function makeUnitAllocationsGridDescriptor(
  columns: readonly UnitAllocationsGridColumn[],
): GridSurfaceDescriptor<UnitAllocationTableRow, UnitAllocationsGridColumn> {
  return makeGridSurfaceDescriptor<UnitAllocationTableRow, UnitAllocationsGridColumn>(
    'unit-allocations.unit',
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
export const UNIT_ALLOCATIONS_TABLE_DEFINITION = parseTableDefinition({
  id: 'unit-allocations.unit',
  tableId: 'unit-allocations',
  entityFamily: 'unit-allocations',
  cellMapKey: 'unit-allocations',
  ariaLabel: 'Order allocations',
  testId: 'unit-allocations-grid-body',
  surface: 'sheet',
  // A unit is allocated a handful of times in its life; a sticky day band per
  // allocation would be one band per row.
  showDayHeaders: false,
  capabilities: UNIT_ALLOCATIONS_GRID_CAPABILITIES,
  columns: UNIT_ALLOCATIONS_COMPOUND_COLUMNS,
});

export const UNIT_ALLOCATIONS_TABLE_BINDING: TableSurfaceBinding<
  UnitAllocationTableRow,
  UnitAllocationsGridColumn
> = {
  definition: UNIT_ALLOCATIONS_TABLE_DEFINITION,
  columns: UNIT_ALLOCATIONS_COMPOUND_COLUMNS,
  makeDescriptor: makeUnitAllocationsGridDescriptor,
  /**
   * HONEST ABSENCE, ruled rather than defaulted. The retired hand table linked
   * nowhere — it printed `#{order_id}` as plain mono text — and there is no
   * desk route for one order to open: To-ship is a QUEUE (`/shipping/orders`),
   * and the only `[orderId]` page in the app is the mobile shell. Inventing a
   * reach-through here would either navigate a bench operator off the unit
   * they are inspecting or stack a second record plane over the detail page
   * this pane is part of.
   *
   * It becomes `navigate` the day an order record route exists.
   */
  recordPlane: {
    kind: 'none',
    reason:
      'A pane on the unit detail page. The retired hand table linked nowhere, and there is no desk record route for one order — To-ship is a queue. Opening a row would navigate away from the unit being inspected.',
  },
};
