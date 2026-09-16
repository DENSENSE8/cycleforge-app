/**
 * `inventory.sku-drift` — the SKU stock-drift table definition, capabilities
 * and surface descriptor.
 *
 * Re-declares nothing: columns are the family SoT by reference.
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { SkuDriftRow } from '@/lib/inventory/drift-rows';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  ADMIN_SKU_DRIFT_COMPOUND_COLUMNS,
  defaultDirForAdminSkuDriftColumn,
  isAdminSkuDriftColumnSortable,
  type AdminSkuDriftGridColumn,
} from './admin-sku-drift-grid-layout';

/**
 * Nothing on this desk writes. A row is a read-time comparison, and the only
 * thing that clears it is `fn_reconcile_sku_stock()` replaying the ledger —
 * which is a whole-org reconciliation behind an admin endpoint, not a per-row
 * verb. Offering "reconcile this SKU" from a cell would mint a second writer
 * into counters the ledger owns.
 *
 * `multiSelect` stays on for the bulk copy-TSV bar every slot peer carries:
 * lifting the drifting SKUs into a reconciliation ticket is why the page is
 * open.
 */
export const ADMIN_SKU_DRIFT_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

export function makeAdminSkuDriftGridDescriptor(
  columns: readonly AdminSkuDriftGridColumn[],
): GridSurfaceDescriptor<SkuDriftRow, AdminSkuDriftGridColumn> {
  return makeGridSurfaceDescriptor<SkuDriftRow, AdminSkuDriftGridColumn>(
    'inventory.sku-drift',
    columns,
    {
      isSortable: (key) => isAdminSkuDriftColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForAdminSkuDriftColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    ADMIN_SKU_DRIFT_GRID_CAPABILITIES,
  );
}

export const ADMIN_SKU_DRIFT_TABLE_DEFINITION = parseTableDefinition({
  id: 'inventory.sku-drift',
  tableId: 'admin-sku-drift',
  entityFamily: 'admin-sku-drift',
  cellMapKey: 'admin-sku-drift',
  ariaLabel: 'SKU stock drift',
  testId: 'admin-sku-drift-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: ADMIN_SKU_DRIFT_GRID_CAPABILITIES,
  columns: ADMIN_SKU_DRIFT_COMPOUND_COLUMNS,
});

export const ADMIN_SKU_DRIFT_TABLE_BINDING: TableSurfaceBinding<
  SkuDriftRow,
  AdminSkuDriftGridColumn
> = {
  definition: ADMIN_SKU_DRIFT_TABLE_DEFINITION,
  columns: ADMIN_SKU_DRIFT_COMPOUND_COLUMNS,
  makeDescriptor: makeAdminSkuDriftGridDescriptor,
  recordPlane: {
    kind: 'navigate',
    reason:
      'The SKU page is the record behind the row — stock counters, the ledger that disagrees with them, and the units underneath. The retired cell was plain text with no link, so this is a reach-through the desk GAINED; it is the same href the sibling drift-alerts desk already declares for the same entity, not a new form.',
  },
};
