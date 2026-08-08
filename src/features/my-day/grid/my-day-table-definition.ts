/**
 * `my-day.today` — My Day task table definition (plan Phase 1, wave 2).
 *
 * Re-declares nothing: columns + capabilities are the family SoT by reference;
 * the shell recipe, aria name, testid and prefs bucket are the literals the
 * mount used to carry. Browse-only (every capability false but fieldsMenu);
 * frozen pane is `select · task`.
 */

import type { MyDayTask } from '@/lib/my-day/my-day-tasks';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { MY_DAY_GRID_COLUMNS, type MyDayGridColumn } from '@/lib/my-day/my-day-grid-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import { MY_DAY_GRID_CAPABILITIES, makeMyDayGridDescriptor } from './my-day-grid-descriptor';

export const MY_DAY_TABLE_DEFINITION = parseTableDefinition({
  id: 'my-day.today',
  tableId: 'my-day',
  entityFamily: 'my-day',
  cellMapKey: 'my-day',
  ariaLabel: 'My Day tasks',
  testId: 'my-day-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: MY_DAY_GRID_CAPABILITIES,
  columns: MY_DAY_GRID_COLUMNS,
});

export const MY_DAY_TABLE_BINDING: TableSurfaceBinding<MyDayTask, MyDayGridColumn> = {
  definition: MY_DAY_TABLE_DEFINITION,
  columns: MY_DAY_GRID_COLUMNS,
  makeDescriptor: makeMyDayGridDescriptor,
};
