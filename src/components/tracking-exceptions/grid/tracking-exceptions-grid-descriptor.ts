/** Tracking Exceptions grid surface descriptor — lifts {@link TRACKING_EXCEPTIONS_GRID_COLUMNS} into the TanStack defs `LedgerGridSurface`… */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { TrackingExceptionRow } from '../types';
import {
  defaultDirForTrackingExceptionsColumn,
  isTrackingExceptionsColumnSortable,
  type TrackingExceptionsGridColumn,
} from './tracking-exceptions-grid-layout';

/** Ops triage queue — read map + row-scoped actions (Refresh · Edit dialog). */
export const TRACKING_EXCEPTIONS_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

/**
 * Build the descriptor from a RESOLVED column list (post-visibility), so
 * `contentMinWidthRem` and the TanStack defs follow the tracks that render.
 */
export function makeTrackingExceptionsGridDescriptor(
  columns: readonly TrackingExceptionsGridColumn[],
): GridSurfaceDescriptor<TrackingExceptionRow, TrackingExceptionsGridColumn> {
  return makeGridSurfaceDescriptor<TrackingExceptionRow, TrackingExceptionsGridColumn>(
    'ops.tracking-exceptions',
    columns,
    {
      isSortable: (key) => isTrackingExceptionsColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForTrackingExceptionsColumn(columns, key) === 'desc',
      // Locked = the mounted model's own frozen prefix (`select · title`).
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    TRACKING_EXCEPTIONS_GRID_CAPABILITIES,
  );
}
