'use client';

import {
  makeLedgerGridColumnHeader,
  type LedgerHeaderLayoutApi,
} from '@/design-system/components/grid';
import {
  IMPORT_EXCEPTION_GRID_COLUMNS,
  isImportExceptionGridSortable,
  type ImportExceptionGridColumn,
  type ImportExceptionGridColumnKey,
} from './import-exception-grid-layout';

const IMPORT_EXCEPTION_HEADER_LAYOUT: LedgerHeaderLayoutApi = {
  isSortable: isImportExceptionGridSortable,
};

export const ImportExceptionGridColumnHeader = makeLedgerGridColumnHeader<
  ImportExceptionGridColumn,
  ImportExceptionGridColumnKey,
  'prop'
>({
  layout: IMPORT_EXCEPTION_HEADER_LAYOUT,
  defaultColumns: IMPORT_EXCEPTION_GRID_COLUMNS,
  selectMode: 'prop',
  tableId: 'import-exception',
});
