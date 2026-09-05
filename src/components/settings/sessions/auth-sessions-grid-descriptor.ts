/**
 * Active sessions grid surface descriptor — lifts the MOUNTED column model (a
 * `SlotLayout` materialization) into the TanStack defs `LedgerGridSurface`
 * mounts.
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { AuthSessionRow } from '@/lib/auth/auth-session-row';
import {
  defaultDirForAuthSessionsColumn,
  isAuthSessionsColumnSortable,
  type AuthSessionsGridColumn,
} from './auth-sessions-grid-layout';

/**
 * Sessions are a READ MAP with one verb (revoke), and that verb lives on the
 * row menu — not in an actions COLUMN, which is the per-family cell the shared
 * row exists to refuse.
 */
export const AUTHSESSIONS_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

export function makeAuthSessionsGridDescriptor(
  columns: readonly AuthSessionsGridColumn[],
): GridSurfaceDescriptor<AuthSessionRow, AuthSessionsGridColumn> {
  return makeGridSurfaceDescriptor<AuthSessionRow, AuthSessionsGridColumn>(
    'settings.sessions',
    columns,
    {
      isSortable: (key) => isAuthSessionsColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForAuthSessionsColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    AUTHSESSIONS_GRID_CAPABILITIES,
  );
}
