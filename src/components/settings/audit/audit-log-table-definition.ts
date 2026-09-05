/**
 * `settings.audit` — the audit log table definition.
 *
 * Re-declares nothing: columns + capabilities are the family SoT by reference.
 * `recordPlane` is an honest `none` — an audit entry is a fact, not a record to
 * open. (The before/after JSON the old page expanded inline is a follow-up: it
 * wants a stage overlay, not a row expander, and no surface reads it today.)
 */

import type { AuditLogRow } from '@/lib/audit-log/audit-log-row';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import {
  AUDIT_LOG_COMPOUND_COLUMNS,
  type AuditLogGridColumn,
} from './audit-log-grid-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  AUDIT_LOG_GRID_CAPABILITIES,
  makeAuditLogGridDescriptor,
} from './audit-log-grid-descriptor';

export const AUDIT_LOG_TABLE_DEFINITION = parseTableDefinition({
  id: 'settings.audit',
  tableId: 'audit-log',
  entityFamily: 'audit-log',
  cellMapKey: 'audit-log',
  ariaLabel: 'Audit log',
  testId: 'audit-log-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: AUDIT_LOG_GRID_CAPABILITIES,
  columns: AUDIT_LOG_COMPOUND_COLUMNS,
});

export const AUDIT_LOG_TABLE_BINDING: TableSurfaceBinding<AuditLogRow, AuditLogGridColumn> = {
  definition: AUDIT_LOG_TABLE_DEFINITION,
  columns: AUDIT_LOG_COMPOUND_COLUMNS,
  makeDescriptor: makeAuditLogGridDescriptor,
  recordPlane: {
    kind: 'none',
    reason:
      'An audit entry is a fact that already happened — there is no record behind the row to open. The entity id names the thing that DOES have one.',
  },
};
