/**
 * `review.import-exception` — sheet rows that never became orders.
 */

import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import type { ImportExceptionRow } from '@/features/review/catalog-link/import-exception-types';
import {
  IMPORT_EXCEPTION_GRID_CAPABILITIES,
  makeImportExceptionGridDescriptor,
} from './import-exception-grid-descriptor';
import {
  IMPORT_EXCEPTION_GRID_COLUMNS,
  type ImportExceptionGridColumn,
} from './import-exception-grid-layout';

export const IMPORT_EXCEPTION_TABLE_DEFINITION = parseTableDefinition({
  id: 'review.import-exception',
  tableId: 'import-exception',
  entityFamily: 'import-exception',
  cellMapKey: 'import-exception',
  ariaLabel: 'Sheet rows missing an item number',
  testId: 'import-exception-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: IMPORT_EXCEPTION_GRID_CAPABILITIES,
  columns: IMPORT_EXCEPTION_GRID_COLUMNS,
});

export const IMPORT_EXCEPTION_TABLE_BINDING: TableSurfaceBinding<
  ImportExceptionRow,
  ImportExceptionGridColumn
> = {
  definition: IMPORT_EXCEPTION_TABLE_DEFINITION,
  columns: IMPORT_EXCEPTION_GRID_COLUMNS,
  makeDescriptor: makeImportExceptionGridDescriptor,
  recordPlane: { kind: 'inspector', occupantId: 'detail:import-exception' },
};
