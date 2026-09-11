/**
 * Inventory › Units grid surface descriptor — lifts the MOUNTED column model
 * (a `SlotLayout` materialization since the wave 1.4 hand-model kill) into the
 * TanStack defs `LedgerGridSurface` mounts. Sortability, default direction and
 * locks all derive from the columns handed in — never a module constant. Row ORDER stays with the
 * house comparator in `useUnitsSpreadsheet` (state math only).
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { UnitsOverviewRow } from '@/hooks/useUnitsOverview';
import {
  defaultDirForUnitsColumn,
  isUnitsColumnSortable,
  type UnitsGridColumn,
} from './units-grid-layout';

/**
 * Units map — browse-only.
 *
 * `multiSelect: false`: the units collection is a pickable map with a record
 * plane (unit dossier), not a bulk-action queue yet — no left checkbox gutter.
 * `inCellEdit: false` (correction at the record plane), `dayBands: false` (flat
 * map), `rowTriageFlags: false` (no staff wash). Fields (▦) stays on so staff
 * can opt columns in/out — and since the wave 1.4 port that flag is HONEST:
 * `UNITS_FIELD_CATALOG` is what it offers.
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
      isSortable: (key) => isUnitsColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForUnitsColumn(columns, key) === 'desc',
      // Locked = the mounted model's own frozen prefix (`serial`).
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    UNITS_GRID_CAPABILITIES,
  );
}
