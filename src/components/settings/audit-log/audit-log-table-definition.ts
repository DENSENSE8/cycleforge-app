/**
 * `settings.audit-log` — the audit-log table definition, capabilities and
 * surface descriptor.
 *
 * Re-declares nothing: columns are the family SoT by reference.
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { AuditLogRow } from '@/lib/audit/audit-log-row';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  AUDITLOG_COMPOUND_COLUMNS,
  defaultDirForAuditLogColumn,
  isAuditLogColumnSortable,
  type AuditLogGridColumn,
} from './audit-log-grid-layout';

/** Nothing on this desk writes. */
export const AUDITLOG_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

function makeAuditLogGridDescriptor(
  columns: readonly AuditLogGridColumn[],
): GridSurfaceDescriptor<AuditLogRow, AuditLogGridColumn> {
  return makeGridSurfaceDescriptor<AuditLogRow, AuditLogGridColumn>(
    'settings.audit-log',
    columns,
    {
      isSortable: (key) => isAuditLogColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForAuditLogColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    AUDITLOG_GRID_CAPABILITIES,
  );
}

const AUDITLOG_TABLE_DEFINITION = parseTableDefinition({
  id: 'settings.audit-log',
  tableId: 'audit-log',
  entityFamily: 'audit-log',
  cellMapKey: 'audit-log',
  ariaLabel: 'Audit log',
  testId: 'audit-log-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: AUDITLOG_GRID_CAPABILITIES,
  columns: AUDITLOG_COMPOUND_COLUMNS,
});

export const AUDITLOG_TABLE_BINDING: TableSurfaceBinding<AuditLogRow, AuditLogGridColumn> = {
  definition: AUDITLOG_TABLE_DEFINITION,
  columns: AUDITLOG_COMPOUND_COLUMNS,
  makeDescriptor: makeAuditLogGridDescriptor,
  recordPlane: {
    kind: 'none',
    reason:
      'Honest absence. The retired page docblock promised "expand a row to see the before/after JSON" and no such plane was ever built — the row selects metadata/before_data/after_data and paints none of them. A record plane here would be inventing the feature, not porting it. The day a diff plane ships it becomes a stage-overlay (law Q5), with its own catalog facts.',
  },
};
