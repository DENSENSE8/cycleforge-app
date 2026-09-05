/**
 * `settings.sessions` — the active sessions table definition.
 *
 * Re-declares nothing: columns + capabilities are the family SoT by reference.
 */

import type { AuthSessionRow } from '@/lib/auth/auth-session-row';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { AUTHSESSIONS_COMPOUND_COLUMNS, type AuthSessionsGridColumn } from './auth-sessions-grid-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  AUTHSESSIONS_GRID_CAPABILITIES,
  makeAuthSessionsGridDescriptor,
} from './auth-sessions-grid-descriptor';

export const AUTHSESSIONS_TABLE_DEFINITION = parseTableDefinition({
  id: 'settings.sessions',
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

export const AUTHSESSIONS_TABLE_BINDING: TableSurfaceBinding<AuthSessionRow, AuthSessionsGridColumn> = {
  definition: AUTHSESSIONS_TABLE_DEFINITION,
  columns: AUTHSESSIONS_COMPOUND_COLUMNS,
  makeDescriptor: makeAuthSessionsGridDescriptor,
  recordPlane: {
    kind: 'none',
    reason:
      'This surface has no record plane — the row IS the fact, and its verbs run from the row menu.',
  },
};
