/**
 * `home.daily` — the Home → Daily task table definition.
 *
 * Re-declares nothing: columns and capabilities are the family SoT by
 * reference; the shell recipe, accessible name, testid and prefs bucket are the
 * literals the mount used to carry.
 */

import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  DAILY_COMPOUND_COLUMNS,
  type DailyGridColumn,
} from '@/lib/daily-checks/daily-grid-layout';
import {
  DAILY_GRID_CAPABILITIES,
  makeDailyGridDescriptor,
} from './daily-grid-descriptor';
import type { DailyTaskRow } from './daily-task-row';

export const DAILY_TABLE_DEFINITION = parseTableDefinition({
  id: 'home.daily',
  tableId: 'daily',
  entityFamily: 'daily',
  cellMapKey: 'daily',
  ariaLabel: 'Daily tasks',
  testId: 'daily-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: DAILY_GRID_CAPABILITIES,
  columns: DAILY_COMPOUND_COLUMNS,
});

export const DAILY_TABLE_BINDING: TableSurfaceBinding<DailyTaskRow, DailyGridColumn> = {
  definition: DAILY_TABLE_DEFINITION,
  columns: DAILY_COMPOUND_COLUMNS,
  makeDescriptor: makeDailyGridDescriptor,
  recordPlane: { kind: 'inspector', occupantId: 'detail:daily-check' },
};
