import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  SESSIONS_COMPOUND_COLUMNS,
  type SessionsGridColumn,
} from '@/lib/sessions/sessions-grid-layout';
import {
  SESSIONS_GRID_CAPABILITIES,
  makeSessionsGridDescriptor,
} from './sessions-grid-descriptor';
import type { SessionDayRow } from '@/lib/sessions/session-day-report';

export const SESSIONS_TABLE_DEFINITION = parseTableDefinition({
  id: 'reports.sessions',
  tableId: 'sessions',
  entityFamily: 'sessions',
  cellMapKey: 'sessions',
  ariaLabel: 'Work sessions',
  testId: 'sessions-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: SESSIONS_GRID_CAPABILITIES,
  columns: SESSIONS_COMPOUND_COLUMNS,
});

export const SESSIONS_TABLE_BINDING: TableSurfaceBinding<SessionDayRow, SessionsGridColumn> = {
  definition: SESSIONS_TABLE_DEFINITION,
  columns: SESSIONS_COMPOUND_COLUMNS,
  makeDescriptor: makeSessionsGridDescriptor,
  recordPlane: { kind: 'inspector', occupantId: 'detail:session-day' },
};
