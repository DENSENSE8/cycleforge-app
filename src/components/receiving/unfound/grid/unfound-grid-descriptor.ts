/**
 * Unfound queue grid surface descriptor — lifts {@link UNFOUND_GRID_COLUMNS}
 * into the TanStack defs `LedgerGridSurface` mounts. Row ORDER stays with the
 * house comparator in `UnfoundQueueTable` (state math only).
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { QueueRow } from '../queue-table/unfound-queue-shared';
import {
  defaultDirForUnfoundGridSort,
  isUnfoundGridFrozen,
  isUnfoundGridSortable,
  type UnfoundGridColumn,
} from './unfound-grid-layout';

/**
 * Unfound triage — an ops queue with genuine in-cell correction.
 *
 * `inCellEdit: true` is the load-bearing flag: ticket id + team notes PATCH
 * through `LedgerCellEditor` (the hand-rolled `<textarea>`/`<input>` waist is
 * gone). `multiSelect: false` — nothing on this surface acts on N rows at once,
 * and an inert checkbox gutter is the workbench law ban. `rowTriageFlags` stays
 * off: a row already carries checked / synced state; a third colour story would
 * be chrome inventing a fact.
 */
export const UNFOUND_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: true,
  fieldsMenu: true,
  dayBands: false,
};

/**
 * Build the descriptor from a RESOLVED column list (post-visibility), so
 * `contentMinWidthRem` and the TanStack defs follow the tracks that render.
 */
export function makeUnfoundGridDescriptor(
  columns: readonly UnfoundGridColumn[],
): GridSurfaceDescriptor<QueueRow, UnfoundGridColumn> {
  return makeGridSurfaceDescriptor<QueueRow, UnfoundGridColumn>(
    'receiving.unfound',
    columns,
    {
      isSortable: isUnfoundGridSortable,
      sortDescFirst: (key) => defaultDirForUnfoundGridSort(key) === 'desc',
      isLocked: isUnfoundGridFrozen,
    },
    UNFOUND_GRID_CAPABILITIES,
  );
}
