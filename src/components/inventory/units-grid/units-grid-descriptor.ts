/**
 * Inventory › Units grid surface descriptor — lifts {@link UNITS_GRID_COLUMNS}
 * into the TanStack defs `LedgerGridSurface` mounts. Row ORDER stays with the
 * house comparator in `UnitsGridView` (state math only).
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { UnitsOverviewRow } from '@/hooks/useUnitsOverview';
import {
  defaultDirForUnitsGridSort,
  isUnitsGridFrozen,
  isUnitsGridSortable,
  type UnitsGridColumn,
} from './units-grid-layout';

/**
 * Units map — browse-only.
 *
 * `multiSelect: false`: the units collection is a pickable map with a record
 * plane (unit dossier), not a bulk-action queue yet — no left checkbox gutter.
 * `inCellEdit: false` (correction at the record plane), `dayBands: false` (flat
 * map), `rowTriageFlags: false` (no staff wash). Fields (▦) stays on so staff
 * can opt columns in/out.
 */
export const UNITS_GRID_CAPABILITIES: GridSurfaceCapabilities = {
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
export function makeUnitsGridDescriptor(
  columns: readonly UnitsGridColumn[],
): GridSurfaceDescriptor<UnitsOverviewRow, UnitsGridColumn> {
  return makeGridSurfaceDescriptor<UnitsOverviewRow, UnitsGridColumn>(
    'inventory.units',
    columns,
    {
      isSortable: isUnitsGridSortable,
      sortDescFirst: (key) => defaultDirForUnitsGridSort(key) === 'desc',
      isLocked: isUnitsGridFrozen,
    },
    UNITS_GRID_CAPABILITIES,
  );
}
