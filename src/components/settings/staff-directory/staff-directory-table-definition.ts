/**
 * `settings.staff-directory` — the team directory's table definition,
 * capabilities and surface descriptor.
 *
 * Re-declares nothing: columns are the family SoT by reference.
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { StaffDirectoryRow } from '@/lib/staff/staff-directory-row';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  STAFF_DIRECTORY_COMPOUND_COLUMNS,
  defaultDirForStaffDirectoryColumn,
  isStaffDirectoryColumnSortable,
  type StaffDirectoryGridColumn,
} from './staff-directory-grid-layout';

/** `inCellEdit: false` is the load-bearing flag on this desk. */
export const STAFF_DIRECTORY_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

function makeStaffDirectoryGridDescriptor(
  columns: readonly StaffDirectoryGridColumn[],
): GridSurfaceDescriptor<StaffDirectoryRow, StaffDirectoryGridColumn> {
  return makeGridSurfaceDescriptor<StaffDirectoryRow, StaffDirectoryGridColumn>(
    'settings.staff-directory',
    columns,
    {
      isSortable: (key) => isStaffDirectoryColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForStaffDirectoryColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    STAFF_DIRECTORY_GRID_CAPABILITIES,
  );
}

const STAFF_DIRECTORY_TABLE_DEFINITION = parseTableDefinition({
  id: 'settings.staff-directory',
  tableId: 'staff-directory',
  entityFamily: 'staff-directory',
  cellMapKey: 'staff-directory',
  ariaLabel: 'Team',
  testId: 'staff-directory-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: STAFF_DIRECTORY_GRID_CAPABILITIES,
  columns: STAFF_DIRECTORY_COMPOUND_COLUMNS,
});

export const STAFF_DIRECTORY_TABLE_BINDING: TableSurfaceBinding<
  StaffDirectoryRow,
  StaffDirectoryGridColumn
> = {
  definition: STAFF_DIRECTORY_TABLE_DEFINITION,
  columns: STAFF_DIRECTORY_COMPOUND_COLUMNS,
  makeDescriptor: makeStaffDirectoryGridDescriptor,
  recordPlane: {
    kind: 'navigate',
    reason:
      "A teammate's record is Settings › Access, where the Roles card is the authoritative editor — the retired Role cell was a per-row <a> to /settings/access?staffId=<id> with the tooltip \"Edit roles in Settings → Access\". Picking a row keeps that exact destination (admin-returns precedent: a retired per-row link becomes the open gesture). The two WRITE verbs open their own stage-overlay planes; those are verb planes, not this row's record.",
  },
};
