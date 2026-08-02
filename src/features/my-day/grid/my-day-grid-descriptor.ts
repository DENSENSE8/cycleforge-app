/**
 * My Day grid surface descriptor — lifts the house {@link MY_DAY_GRID_COLUMNS}
 * SoT into the TanStack defs `LedgerGridSurface` mounts. Sorting stays inside
 * the Today sort vocabulary; row ORDER stays with the house comparator in
 * {@link MyDayGridView} (TanStack owns state math only).
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { MyDayTask } from '@/lib/my-day/my-day-tasks';
import {
  defaultDirForMyDayGridSort,
  isMyDayGridFrozen,
  isMyDayGridSortable,
  type MyDayGridColumn,
} from '@/lib/my-day/my-day-grid-layout';

/**
 * Today browse — pick a task and open where the work happens.
 *
 * Everything is off, and each `false` is a decision rather than a default:
 *  • `rowTriageFlags` — triage wash is outbound dispatch vocabulary (Orders
 *    only); a personal task list has no staff flags to paint.
 *  • `multiSelect` — there is no bulk action on someone's own day; the select
 *    gutter is the empty spacer that keeps the frozen pane aligned with the
 *    other station grids.
 *  • `inCellEdit` — every field here is derived from the record the row points
 *    at (an order's status, a ticket's subject). Correction belongs at that
 *    record, not in a cell that would write nowhere.
 *  • `dayBands` — Today is one civil day by definition.
 *
 * `fieldsMenu` is the one that is ON (2026-08-01): `GridFieldsMenu` mounts in the
 * chrome's `WorkbenchTrailingCluster`, `queue` and `status` ship `optional`, and
 * prefs persist per staff under `TableId` `'my-day'`. All of that landed
 * together — a flag without the menu, the `TABLE_COLUMNS` entry and the
 * `hideKey`s is a claim on a staff-preference surface that does not exist.
 */
export const MY_DAY_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

/** Build the descriptor from a RESOLVED column list (post-visibility). */
export function makeMyDayGridDescriptor(
  columns: readonly MyDayGridColumn[],
): GridSurfaceDescriptor<MyDayTask, MyDayGridColumn> {
  return makeGridSurfaceDescriptor<MyDayTask, MyDayGridColumn>(
    'my-day.today',
    columns,
    {
      isSortable: isMyDayGridSortable,
      sortDescFirst: (key) => defaultDirForMyDayGridSort(key) === 'desc',
      isLocked: isMyDayGridFrozen,
    },
    MY_DAY_GRID_CAPABILITIES,
  );
}
