/**
 * `settings.staff` — the team table definition.
 *
 * Re-declares nothing: columns + capabilities are the family SoT by reference.
 */

import type { StaffDirectoryRow } from '@/lib/staff/staff-directory-row';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { STAFFDIRECTORY_COMPOUND_COLUMNS, type StaffDirectoryGridColumn } from './staff-directory-grid-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  STAFFDIRECTORY_GRID_CAPABILITIES,
  makeStaffDirectoryGridDescriptor,
} from './staff-directory-grid-descriptor';

export const STAFFDIRECTORY_TABLE_DEFINITION = parseTableDefinition({
  id: 'settings.staff',
  tableId: 'staff-directory',
  entityFamily: 'staff-directory',
  cellMapKey: 'staff-directory',
  ariaLabel: 'Team',
  testId: 'staff-directory-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: STAFFDIRECTORY_GRID_CAPABILITIES,
  columns: STAFFDIRECTORY_COMPOUND_COLUMNS,
});

export const STAFFDIRECTORY_TABLE_BINDING: TableSurfaceBinding<StaffDirectoryRow, StaffDirectoryGridColumn> = {
  definition: STAFFDIRECTORY_TABLE_DEFINITION,
  columns: STAFFDIRECTORY_COMPOUND_COLUMNS,
  makeDescriptor: makeStaffDirectoryGridDescriptor,
  recordPlane: {
    kind: 'none',
    reason:
      'This surface has no record plane — the row IS the fact, and its verbs run from the row menu.',
  },
};
