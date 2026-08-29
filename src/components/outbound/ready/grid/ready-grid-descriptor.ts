/**
 * Ready / recently-tested grid surface descriptor — lifts
 * {@link READY_GRID_COLUMNS} into the TanStack defs `LedgerGridSurface` mounts.
 * Row ORDER stays with the house comparator in `ReadyQueueTable` (state math only).
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { AllocationHit } from '@/lib/channel-allocation';
import {
  defaultDirForReadyGridSort,
  isReadyGridFrozen,
  isReadyGridSortable,
  type ReadyGridColumn,
} from './ready-grid-layout';

/**
 * Ready history — a read map with one row-scoped escape (Stage FBA).
 *
 * Every mutating flag is `false`, and that is the point of the surface: these
 * are append-only `testing_results` rows. There is no record to correct here and
 * nothing to act on in bulk — the work happens on the FBA board the action cell
 * links to. `rowTriageFlags` stays off because a row already carries a verdict
 * AND a destination; a third colour story would be chrome inventing a fact.
 */
export const READY_GRID_CAPABILITIES: GridSurfaceCapabilities = {
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
export function makeReadyGridDescriptor(
  columns: readonly ReadyGridColumn[],
): GridSurfaceDescriptor<AllocationHit, ReadyGridColumn> {
  return makeGridSurfaceDescriptor<AllocationHit, ReadyGridColumn>(
    'outbound.ready',
    columns,
    {
      isSortable: isReadyGridSortable,
      sortDescFirst: (key) => defaultDirForReadyGridSort(key) === 'desc',
      isLocked: isReadyGridFrozen,
    },
    READY_GRID_CAPABILITIES,
  );
}
