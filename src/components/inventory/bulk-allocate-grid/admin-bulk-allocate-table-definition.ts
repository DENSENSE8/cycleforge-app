/**
 * `admin-bulk-allocate.candidates` — the bulk-allocate table definition,
 * capabilities and surface descriptor.
 *
 * Re-declares nothing: columns + capabilities are the family SoT by reference,
 * and the canonical columns are the product-default MATERIALIZATION
 * (`ADMIN_BULK_ALLOCATE_COMPOUND_COLUMNS`), never a hand array.
 */

import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { AllocationCandidateRow } from '@/lib/inventory/allocation-candidate-row';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  ADMIN_BULK_ALLOCATE_COMPOUND_COLUMNS,
  defaultDirForAdminBulkAllocateColumn,
  isAdminBulkAllocateColumnSortable,
  type AdminBulkAllocateGridColumn,
} from './admin-bulk-allocate-grid-layout';

/**
 * One WRITE, per row, and it is a VERB rather than a cell
 * (`admin-bulk-allocate-verbs.ts`).
 *
 * `multiSelect` stays OFF. The page is named "bulk allocate" because the LIST
 * is bulk — a hundred candidates on one screen — not because the verb is: the
 * retired desk had no checkboxes and no bulk submit, and `allocateOne` writes
 * exactly one order. Turning the gutter on would paint a control with no verb
 * behind it (the `admin-returns` ruling). Bulk is a cardinality, not a mode:
 * the day someone wires a bulk allocate it is THIS verb at n>1 and this flag
 * flips — nothing else changes.
 *
 * `inCellEdit: false` like every family in this repo — the allocation payload
 * is one order id, so the verb needs no parameter and therefore no editor and
 * no plane.
 */
export const ADMIN_BULK_ALLOCATE_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

/**
 * Build the descriptor from a RESOLVED column list (post-visibility), so
 * `contentMinWidthRem` and the TanStack defs follow the tracks that actually
 * render. `columns` is REQUIRED: a module-constant default is the `grid-default`
 * debt the discover scanner deletes.
 */
export function makeAdminBulkAllocateGridDescriptor(
  columns: readonly AdminBulkAllocateGridColumn[],
): GridSurfaceDescriptor<AllocationCandidateRow, AdminBulkAllocateGridColumn> {
  return makeGridSurfaceDescriptor<AllocationCandidateRow, AdminBulkAllocateGridColumn>(
    'admin-bulk-allocate.candidates',
    columns,
    {
      isSortable: (key) => isAdminBulkAllocateColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForAdminBulkAllocateColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    ADMIN_BULK_ALLOCATE_GRID_CAPABILITIES,
  );
}

/**
 * Validated at module load: a definition that violates a structural law throws
 * here rather than painting a broken grid.
 */
export const ADMIN_BULK_ALLOCATE_TABLE_DEFINITION = parseTableDefinition({
  id: 'admin-bulk-allocate.candidates',
  tableId: 'admin-bulk-allocate',
  entityFamily: 'admin-bulk-allocate',
  cellMapKey: 'admin-bulk-allocate',
  ariaLabel: 'Allocation candidates',
  testId: 'admin-bulk-allocate-grid-body',
  surface: 'sheet',
  // The feed is one offset page ordered by order id; the order stamp is a
  // per-row track, not a sticky day header.
  showDayHeaders: false,
  capabilities: ADMIN_BULK_ALLOCATE_GRID_CAPABILITIES,
  columns: ADMIN_BULK_ALLOCATE_COMPOUND_COLUMNS,
});

export const ADMIN_BULK_ALLOCATE_TABLE_BINDING: TableSurfaceBinding<
  AllocationCandidateRow,
  AdminBulkAllocateGridColumn
> = {
  definition: ADMIN_BULK_ALLOCATE_TABLE_DEFINITION,
  columns: ADMIN_BULK_ALLOCATE_COMPOUND_COLUMNS,
  makeDescriptor: makeAdminBulkAllocateGridDescriptor,
  /**
   * The row's record is the SKU's stock page — `/inventory/health/sku/<sku>` is
   * where an operator goes to find out why a candidate is short, and it is the
   * exact destination the retired SKU cell's `<Link>` carried. That is a ROUTE,
   * not a panel, so the plane is `navigate` and the reach-through is declared
   * once on the entity instead of as per-cell JSX.
   */
  recordPlane: {
    kind: 'navigate',
    reason:
      'A candidate row is one order waiting on one SKU; picking it opens /inventory/health/sku/<sku>, the stock page the retired SKU cell linked per row.',
  },
};
