import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid/grid-surface-descriptor';
import type { ImportExceptionRow } from '@/features/review/catalog-link/import-exception-types';
import type { ImportExceptionGridColumn } from './import-exception-grid-layout';

/** Missing item number is a QUEUE, not a checklist: */
export const IMPORT_EXCEPTION_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

export function makeImportExceptionGridDescriptor(
  visible: readonly ImportExceptionGridColumn[],
): GridSurfaceDescriptor<ImportExceptionRow, ImportExceptionGridColumn> {
  return makeGridSurfaceDescriptor<ImportExceptionRow, ImportExceptionGridColumn>(
    'review.import-exception',
    visible,
    undefined,
    IMPORT_EXCEPTION_GRID_CAPABILITIES,
  );
}
