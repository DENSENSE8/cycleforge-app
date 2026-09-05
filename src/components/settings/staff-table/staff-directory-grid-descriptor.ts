/**
 * Team grid surface descriptor — lifts the MOUNTED column model (a
 * `SlotLayout` materialization) into the TanStack defs `LedgerGridSurface`
 * mounts.
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { StaffDirectoryRow } from '@/lib/staff/staff-directory-row';
import {
  defaultDirForStaffDirectoryColumn,
  isStaffDirectoryColumnSortable,
  type StaffDirectoryGridColumn,
} from './staff-directory-grid-layout';

/**
 * Staff verbs (change role, deactivate, resend invite) run from the ROW MENU.
 * `thumb` is KEPT here — a staff row is the one place in this port where the
 * photo gutter carries a real fact, and an operator recognises a face faster
 * than a name.
 */
export const STAFFDIRECTORY_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

export function makeStaffDirectoryGridDescriptor(
  columns: readonly StaffDirectoryGridColumn[],
): GridSurfaceDescriptor<StaffDirectoryRow, StaffDirectoryGridColumn> {
  return makeGridSurfaceDescriptor<StaffDirectoryRow, StaffDirectoryGridColumn>(
    'settings.staff',
    columns,
    {
      isSortable: (key) => isStaffDirectoryColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForStaffDirectoryColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    STAFFDIRECTORY_GRID_CAPABILITIES,
  );
}
