/**
 * Kiosk devices grid surface descriptor — lifts the MOUNTED column model (a
 * `DataTableColumnLayout` materialization) into the TanStack defs `LedgerGridSurface`
 * mounts.
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { KioskDeviceTableRow } from '@/lib/kiosk/kiosk-device-row';
import {
  defaultDirForKioskDevicesColumn,
  isKioskDevicesColumnSortable,
  type KioskDevicesGridColumn,
} from './kiosk-devices-grid-layout';

/**
 * Pairing verbs (pair, unpair, revoke) run from the ROW MENU. The retired
 * display carried them in an actions COLUMN — a per-family cell, and the reason
 * it could not mount the shared row.
 */
export const KIOSKDEVICES_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  dayBands: false,
};

export function makeKioskDevicesGridDescriptor(
  columns: readonly KioskDevicesGridColumn[],
): GridSurfaceDescriptor<KioskDeviceTableRow, KioskDevicesGridColumn> {
  return makeGridSurfaceDescriptor<KioskDeviceTableRow, KioskDevicesGridColumn>(
    'settings.kiosk-devices',
    columns,
    {
      isSortable: (key) => isKioskDevicesColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForKioskDevicesColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    KIOSKDEVICES_GRID_CAPABILITIES,
  );
}
