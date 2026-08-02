/**
 * Warehouse › Bins grid surface descriptor — lifts {@link BINS_GRID_COLUMNS}
 * into the TanStack defs `LedgerGridSurface` mounts. Row ORDER stays with the
 * house comparator in `BinsGridView` (state math only).
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { BinsOverviewRow } from '@/hooks/useBinsOverview';
import {
  defaultDirForBinsGridSort,
  isBinsGridFrozen,
  isBinsGridSortable,
  type BinsGridColumn,
} from './bins-grid-layout';

/**
 * Warehouse bins map — browse + parent-controlled multi-select.
 *
 * `multiSelect: true`: the bulk action bar (print labels / cycle count) acts on
 * N bins at once, so the left gutter is a live checkbox plane. Everything else
 * is browse-only — no in-cell edit, no triage wash, no day bands.
 */
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
      isSortable: isBinsGridSortable,
      sortDescFirst: (key) => defaultDirForBinsGridSort(key) === 'desc',
      isLocked: isBinsGridFrozen,
    },
    BINS_GRID_CAPABILITIES,
  );
}
