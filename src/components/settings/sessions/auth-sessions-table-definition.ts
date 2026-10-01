/**
 * `settings.auth-sessions` — the active-sessions table definition, capabilities
 * and surface descriptor.
 *
 * Re-declares nothing: columns are the family SoT by reference.
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { AuthSessionTableRow } from '@/lib/auth/auth-session-row';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  AUTHSESSIONS_COMPOUND_COLUMNS,
  defaultDirForAuthSessionsColumn,
  isAuthSessionsColumnSortable,
  type AuthSessionsGridColumn,
} from './auth-sessions-grid-layout';

/** Revoke runs from the ROW MENU (and its trailing face). */
export const AUTHSESSIONS_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  dayBands: false,
};

function makeAuthSessionsGridDescriptor(
  columns: readonly AuthSessionsGridColumn[],
): GridSurfaceDescriptor<AuthSessionTableRow, AuthSessionsGridColumn> {
  return makeGridSurfaceDescriptor<AuthSessionTableRow, AuthSessionsGridColumn>(
    'settings.auth-sessions',
    columns,
    {
      isSortable: (key) => isAuthSessionsColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForAuthSessionsColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    AUTHSESSIONS_GRID_CAPABILITIES,
  );
}

const AUTHSESSIONS_TABLE_DEFINITION = parseTableDefinition({
  id: 'settings.auth-sessions',
  tableId: 'auth-sessions',
  entityFamily: 'auth-sessions',
  cellMapKey: 'auth-sessions',
  ariaLabel: 'Active sessions',
  testId: 'auth-sessions-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: AUTHSESSIONS_GRID_CAPABILITIES,
  columns: AUTHSESSIONS_COMPOUND_COLUMNS,
});

export const AUTHSESSIONS_TABLE_BINDING: TableSurfaceBinding<AuthSessionTableRow, AuthSessionsGridColumn> = {
  definition: AUTHSESSIONS_TABLE_DEFINITION,
  columns: AUTHSESSIONS_COMPOUND_COLUMNS,
  makeDescriptor: makeAuthSessionsGridDescriptor,
  recordPlane: {
    kind: 'stage-overlay',
    reason:
      'Revoke confirm stacks as DeskStageOverlay over /settings/sessions — the table stays mounted (Q5), and an admin can still read the row they are about to kill. Replaced window.confirm.',
  },
};
