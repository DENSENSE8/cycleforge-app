/** My Day grid surface descriptor — lifts the house {@link MY_DAY_GRID_COLUMNS} SoT into the TanStack defs `LedgerGridSurface` mounts. */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { MyDayTask } from '@/lib/my-day/my-day-tasks';
import {
  defaultDirForMyDayColumn,
  isMyDayColumnSortable,
  type MyDayGridColumn,
} from '@/lib/my-day/my-day-grid-layout';

/** Today browse — pick a task and open where the work happens. */
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
      isSortable: (key) => isMyDayColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForMyDayColumn(columns, key) === 'desc',
      // Locked = the mounted model's own frozen prefix (`select · task`).
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    MY_DAY_GRID_CAPABILITIES,
  );
}
