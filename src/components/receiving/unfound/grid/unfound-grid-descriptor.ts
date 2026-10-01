/**
 * Unfound queue grid surface descriptor — lifts {@link UNFOUND_GRID_COLUMNS}
 * into the TanStack defs `LedgerGridSurface` mounts. Row ORDER belongs to the
 * mounting host (state math only).
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { QueueRow } from '../queue-table/unfound-queue-shared';
import {
  defaultDirForUnfoundColumn,
  isUnfoundColumnSortable,
  type UnfoundGridColumn,
} from './unfound-grid-layout';

/** Unfound triage — an ops queue whose cells are read-only. */
export const UNFOUND_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
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
      isSortable: (key) => isUnfoundColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForUnfoundColumn(columns, key) === 'desc',
      // Locked = the mounted model's own frozen prefix (`select · title`).
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    UNFOUND_GRID_CAPABILITIES,
  );
}
