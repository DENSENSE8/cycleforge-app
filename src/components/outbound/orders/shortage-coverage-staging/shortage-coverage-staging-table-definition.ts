/**
 * `shortage-coverage-import.staging` — Shortage CSV coverage triage.
 *
 * Own entityFamily / prefs bucket rather than `orders`: a staging row is a
 * parsed CSV record with a triage state, not a live order.
 */

import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import type { ShortageCoverageImportRowView } from '@/lib/orders/shortage-coverage-import-descriptor';
import {
  SHORTAGE_COVERAGE_STAGING_SHEET_COLUMNS,
  type ShortageCoverageStagingGridColumn,
} from './shortage-coverage-staging-grid-layout';
import {
  SHORTAGE_COVERAGE_STAGING_GRID_CAPABILITIES,
  makeShortageCoverageStagingGridDescriptor,
} from './shortage-coverage-staging-grid-descriptor';

export const SHORTAGE_COVERAGE_STAGING_TABLE_DEFINITION = parseTableDefinition({
  id: 'shortage-coverage-import.staging',
  tableId: 'shortage-coverage-import',
  entityFamily: 'shortage-coverage-import',
  cellMapKey: 'shortage-coverage-import',
  ariaLabel: 'Shortage coverage import staging rows',
  testId: 'shortage-coverage-staging-grid',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: SHORTAGE_COVERAGE_STAGING_GRID_CAPABILITIES,
  columns: SHORTAGE_COVERAGE_STAGING_SHEET_COLUMNS,
});

export const SHORTAGE_COVERAGE_STAGING_TABLE_BINDING: TableSurfaceBinding<
  ShortageCoverageImportRowView,
  ShortageCoverageStagingGridColumn
> = {
  definition: SHORTAGE_COVERAGE_STAGING_TABLE_DEFINITION,
  columns: SHORTAGE_COVERAGE_STAGING_SHEET_COLUMNS,
  makeDescriptor: makeShortageCoverageStagingGridDescriptor,
  recordPlane: { kind: 'inspector', occupantId: 'detail:shortage-coverage-import-staging' },
};
