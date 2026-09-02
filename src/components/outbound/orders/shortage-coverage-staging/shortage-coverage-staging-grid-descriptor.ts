/**
 * Shortage coverage CSV staging grid surface descriptor.
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { ShortageCoverageImportRowView } from '@/lib/orders/shortage-coverage-import-descriptor';
import {
  defaultDirForShortageCoverageStagingColumn,
  isShortageCoverageStagingColumnSortable,
  type ShortageCoverageStagingGridColumn,
} from './shortage-coverage-staging-grid-layout';

export const SHORTAGE_COVERAGE_STAGING_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

export function makeShortageCoverageStagingGridDescriptor(
  columns: readonly ShortageCoverageStagingGridColumn[],
): GridSurfaceDescriptor<ShortageCoverageImportRowView, ShortageCoverageStagingGridColumn> {
  return makeGridSurfaceDescriptor<
    ShortageCoverageImportRowView,
    ShortageCoverageStagingGridColumn
  >('shortage-coverage-import.staging', columns, {
    isSortable: (key) => isShortageCoverageStagingColumnSortable(columns, key),
    sortDescFirst: (key) => defaultDirForShortageCoverageStagingColumn(columns, key) === 'desc',
    isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
  }, SHORTAGE_COVERAGE_STAGING_GRID_CAPABILITIES);
}
