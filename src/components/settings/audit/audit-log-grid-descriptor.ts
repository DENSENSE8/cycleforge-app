/**
 * Audit log grid surface descriptor — lifts the MOUNTED column model (a
 * `SlotLayout` materialization) into the TanStack defs `LedgerGridSurface`
 * mounts.
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { AuditLogRow } from '@/lib/audit-log/audit-log-row';
import {
  defaultDirForAuditLogColumn,
  isAuditLogColumnSortable,
  type AuditLogGridColumn,
} from './audit-log-grid-layout';

/**
 * The audit log is a READ MAP: an entry already happened, so there is nothing to
 * triage, edit in cell or select in bulk. `fieldsMenu` stays on — binding and
 * hiding facts is the whole point of leaving `AdminTable`, which could do
 * neither.
 */
export const AUDIT_LOG_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

export function makeAuditLogGridDescriptor(
  columns: readonly AuditLogGridColumn[],
): GridSurfaceDescriptor<AuditLogRow, AuditLogGridColumn> {
  return makeGridSurfaceDescriptor<AuditLogRow, AuditLogGridColumn>(
    'settings.audit',
    columns,
    {
      isSortable: (key) => isAuditLogColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForAuditLogColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    AUDIT_LOG_GRID_CAPABILITIES,
  );
}
