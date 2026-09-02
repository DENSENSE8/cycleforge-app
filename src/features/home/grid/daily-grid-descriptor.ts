import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid/grid-surface-descriptor';
import {
  DAILY_COMPOUND_COLUMNS,
  dailySortFactFor,
  defaultDirForDailyGridSort,
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
    {
      // Sortability is a property of the BOUND FACT, not of the track: a
      // checklist row has no order and no price, so the compound
      // `fulfillment` / `amount` tracks carry nothing to order by. Passing
      // `undefined` here let the header offer a sort the desk could not
      // perform — a click that moved a caret and reordered nothing.
      isSortable: (key) => {
        const col = visible.find((c) => c.key === key);
        return col ? dailySortFactFor(col) != null : false;
      },
      sortDescFirst: (key) => {
        const col = visible.find((c) => c.key === key);
        const fact = col ? dailySortFactFor(col) : null;
        return fact ? defaultDirForDailyGridSort(fact) === 'desc' : false;
      },
    },
    DAILY_GRID_CAPABILITIES,
  );
}

export { DAILY_COMPOUND_COLUMNS };
