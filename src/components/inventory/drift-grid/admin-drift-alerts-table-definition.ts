/**
 * `inventory.drift-alerts` — the open-DRIFT-alerts table definition,
 * capabilities and surface descriptor.
 *
 * Re-declares nothing: columns are the family SoT by reference.
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { DriftAlertRow } from '@/lib/inventory/drift-rows';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  ADMIN_DRIFT_ALERTS_COMPOUND_COLUMNS,
  defaultDirForAdminDriftAlertsColumn,
  isAdminDriftAlertsColumnSortable,
  type AdminDriftAlertsGridColumn,
} from './admin-drift-alerts-grid-layout';

/** Nothing on this desk writes. */
export const ADMIN_DRIFT_ALERTS_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

function makeAdminDriftAlertsGridDescriptor(
  columns: readonly AdminDriftAlertsGridColumn[],
): GridSurfaceDescriptor<DriftAlertRow, AdminDriftAlertsGridColumn> {
  return makeGridSurfaceDescriptor<DriftAlertRow, AdminDriftAlertsGridColumn>(
    'inventory.drift-alerts',
    columns,
    {
      isSortable: (key) => isAdminDriftAlertsColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForAdminDriftAlertsColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    ADMIN_DRIFT_ALERTS_GRID_CAPABILITIES,
  );
}

const ADMIN_DRIFT_ALERTS_TABLE_DEFINITION = parseTableDefinition({
  id: 'inventory.drift-alerts',
  tableId: 'admin-drift-alerts',
  entityFamily: 'admin-drift-alerts',
  cellMapKey: 'admin-drift-alerts',
  ariaLabel: 'Open drift alerts',
  testId: 'admin-drift-alerts-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: ADMIN_DRIFT_ALERTS_GRID_CAPABILITIES,
  columns: ADMIN_DRIFT_ALERTS_COMPOUND_COLUMNS,
});

export const ADMIN_DRIFT_ALERTS_TABLE_BINDING: TableSurfaceBinding<
  DriftAlertRow,
  AdminDriftAlertsGridColumn
> = {
  definition: ADMIN_DRIFT_ALERTS_TABLE_DEFINITION,
  columns: ADMIN_DRIFT_ALERTS_COMPOUND_COLUMNS,
  makeDescriptor: makeAdminDriftAlertsGridDescriptor,
  recordPlane: {
    kind: 'navigate',
    reason:
      "The retired SKU cell was an `<a href=\"/inventory/health/sku/{sku}\">`, and that page IS the record behind the row — stock counters, ledger, units and the drift this alert is about. Declared once here so the mount supplies only the router, and the reach-through stops being a link inside a cell.",
  },
};
