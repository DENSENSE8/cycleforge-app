/** Warehouse › Bins grid surface descriptor — lifts the MOUNTED column model (a `SlotLayout` materialization since the wave 1.4 hand-model… */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { BinsOverviewRow } from '@/hooks/useBinsOverview';
import {
  defaultDirForBinsColumn,
  isBinsColumnSortable,
  type BinsGridColumn,
} from './bins-grid-layout';

/** Warehouse bins map — browse + parent-controlled multi-select. */
export const BINS_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

/** Shared with the header select-all bus and any future action-bar listener. */
export const BINS_SELECTION_SCOPE = 'warehouse.bins';

/**
 * Build the descriptor from a RESOLVED column list (post-visibility), so
 * `contentMinWidthRem` and the TanStack defs follow the tracks that render.
 */
export function makeBinsGridDescriptor(
  columns: readonly BinsGridColumn[],
): GridSurfaceDescriptor<BinsOverviewRow, BinsGridColumn> {
  return makeGridSurfaceDescriptor<BinsOverviewRow, BinsGridColumn>(
    'warehouse.bins',
    columns,
    {
      isSortable: (key) => isBinsColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForBinsColumn(columns, key) === 'desc',
      // Locked = the mounted model's own frozen prefix (`select · barcode`).
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    BINS_GRID_CAPABILITIES,
  );
}
