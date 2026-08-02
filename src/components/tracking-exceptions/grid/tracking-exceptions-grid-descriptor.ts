/**
 * Tracking Exceptions grid surface descriptor — lifts
 * {@link TRACKING_EXCEPTIONS_GRID_COLUMNS} into the TanStack defs
 * `LedgerGridSurface` mounts. Row ORDER stays with the house comparator in
 * {@link TrackingExceptionsGridView} (state math only).
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { TrackingExceptionRow } from '../types';
import {
  defaultDirForTrackingExceptionsGridSort,
  isTrackingExceptionsGridFrozen,
  isTrackingExceptionsGridSortable,
  type TrackingExceptionsGridColumn,
} from './tracking-exceptions-grid-layout';

/**
 * Ops triage queue — read map + row-scoped actions (Refresh · Edit dialog).
 *
 * `multiSelect: false`: nothing on this surface acts on N exceptions at once.
 * `inCellEdit: false`: corrections open the record-plane dialog.
 * `rowTriageFlags: false` — triage wash is outbound dispatch vocabulary; a row
 * already carries its own status pill, and a second colour story would be
 * chrome inventing a fact (Kinetic Ledger law 1).
 */
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
    'ops.trackingExceptions',
    columns,
    {
      isSortable: isTrackingExceptionsGridSortable,
      sortDescFirst: (key) => defaultDirForTrackingExceptionsGridSort(key) === 'desc',
      isLocked: isTrackingExceptionsGridFrozen,
    },
    TRACKING_EXCEPTIONS_GRID_CAPABILITIES,
  );
}
