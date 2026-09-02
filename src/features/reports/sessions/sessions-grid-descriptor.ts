import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid/grid-surface-descriptor';
import {
  SESSIONS_COMPOUND_COLUMNS,
  sessionsSortFactFor,
  defaultDirForSessionsGridSort,
  type SessionsGridColumn,
} from '@/lib/sessions/sessions-grid-layout';
import type { SessionDayRow } from '@/lib/sessions/session-day-report';

export const SESSIONS_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

export function makeSessionsGridDescriptor(
  visible: readonly SessionsGridColumn[],
): GridSurfaceDescriptor<SessionDayRow, SessionsGridColumn> {
  return makeGridSurfaceDescriptor<SessionDayRow, SessionsGridColumn>(
    'reports.sessions',
    visible,
    {
      isSortable: (key) => {
        const col = visible.find((c) => c.key === key);
        return col ? sessionsSortFactFor(col) != null : false;
      },
      sortDescFirst: (key) => {
        const col = visible.find((c) => c.key === key);
        const fact = col ? sessionsSortFactFor(col) : null;
        return fact ? defaultDirForSessionsGridSort(fact) === 'desc' : false;
      },
    },
    SESSIONS_GRID_CAPABILITIES,
  );
}

export { SESSIONS_COMPOUND_COLUMNS };
