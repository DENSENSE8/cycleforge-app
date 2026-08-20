import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid/grid-surface-descriptor';
import {
  DAILY_GRID_COLUMNS,
  type DailyGridColumn,
} from '@/lib/daily-checks/daily-grid-layout';
import type { DailyTaskRow } from '@/features/home/grid/daily-task-row';

/**
 * Daily is a CHECKLIST, and the capability bag says so:
 *
 * `multiSelect: false` — the gutter checkbox is the surface's primary VERB
 * (tick the task), not a selection. Declaring multi-select would mount the
 * select-all wiring on top of it and give one control two meanings.
 *
 * `inCellEdit: false` — renaming a task edits the org's checklist for every
 * staffer on every future day, which is a record-plane act, not a cell act.
 */
export const DAILY_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

export function makeDailyGridDescriptor(
  visible: readonly DailyGridColumn[],
): GridSurfaceDescriptor<DailyTaskRow, DailyGridColumn> {
  return makeGridSurfaceDescriptor<DailyTaskRow, DailyGridColumn>(
    'home.daily',
    visible,
    undefined,
    DAILY_GRID_CAPABILITIES,
  );
}

export { DAILY_GRID_COLUMNS };
