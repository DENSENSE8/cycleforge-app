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
  PICKUP_GRID_COLUMNS,
  defaultDirForPickupGridSort,
  isPickupGridFrozen,
  isPickupGridSortable,
  pickupContentMinWidthRem,
  type PickupGridColumn,
} from './pickup-grid-layout';

export const PICKUP_GRID_DESCRIPTOR: GridSurfaceDescriptor<PickupLine, PickupGridColumn> =
  makeGridSurfaceDescriptor<PickupLine, PickupGridColumn>(
    'pickup.browse',
    PICKUP_GRID_COLUMNS,
    pickupContentMinWidthRem(PICKUP_GRID_COLUMNS),
    {
      isSortable: isPickupGridSortable,
      sortDescFirst: (key) => defaultDirForPickupGridSort(key) === 'desc',
      isLocked: isPickupGridFrozen,
    },
  );
