/**
 * Local Pickup grid surface descriptor — lifts the house
 * {@link PICKUP_GRID_COLUMNS} SoT into the TanStack defs `LedgerGridSurface`
 * mounts. Sorting stays inside the pickup sort vocabulary; row ORDER stays with
 * the house comparator in {@link PickupGridView} (state math only — grouping is
 * house `group-rows`, not TanStack).
 */

import { makeGridSurfaceDescriptor, type GridSurfaceDescriptor } from '@/design-system/components/grid';
import type { PickupLine } from '../pickup-lines';
import {
  defaultDirForPickupGridSort,
  isPickupGridFrozen,
  isPickupGridSortable,
  type PickupGridColumn,
} from './pickup-grid-layout';

/**
 * Build the descriptor from a RESOLVED column list (post-visibility), so
 * `contentMinWidthRem` and the TanStack defs follow the tracks that actually
 * render — a hidden column loses its width, not just its content.
 */
export function makePickupGridDescriptor(
  columns: readonly PickupGridColumn[],
): GridSurfaceDescriptor<PickupLine, PickupGridColumn> {
  return makeGridSurfaceDescriptor<PickupLine, PickupGridColumn>(
    'pickup.browse',
    columns,
    {
      isSortable: isPickupGridSortable,
      sortDescFirst: (key) => defaultDirForPickupGridSort(key) === 'desc',
      isLocked: isPickupGridFrozen,
    },
  );
}

// No pre-built canonical descriptor: the column set is now resolved per staffer
// by `useGridColumnVisibility`, so `PickupGridView` always builds from the
// RESOLVED list (which also keeps `contentMinWidthRem` and the CSS grid template
// honest when a track is hidden). A module-level constant built from the full
// column list would have been wrong for every staffer with a delta.
