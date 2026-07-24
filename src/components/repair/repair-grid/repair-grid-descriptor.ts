/**
 * Repair queue grid surface descriptor — lifts the house `REPAIR_GRID_COLUMNS`
 * SoT into the TanStack defs `LedgerGridSurface` mounts. Sorting stays inside
 * the repair sort vocabulary (`isRepairGridSortable`); row ORDER stays with the
 * house comparator (`compareRepairGridRows`) — the defs are state math only.
 */

import { makeGridSurfaceDescriptor, type GridSurfaceDescriptor } from '@/design-system/components/grid';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import {
  REPAIR_GRID_COLUMNS,
  defaultDirForRepairGridSort,
  isRepairGridFrozen,
  isRepairGridSortable,
  repairContentMinWidthRem,
  type RepairGridColumn,
} from '@/lib/repair/repair-grid-layout';

export const REPAIR_GRID_DESCRIPTOR: GridSurfaceDescriptor<RSRecord, RepairGridColumn> =
  makeGridSurfaceDescriptor<RSRecord, RepairGridColumn>(
    'repair.queue',
    REPAIR_GRID_COLUMNS,
    repairContentMinWidthRem(REPAIR_GRID_COLUMNS),
    {
      isSortable: isRepairGridSortable,
      sortDescFirst: (key) => defaultDirForRepairGridSort(key) === 'desc',
      isLocked: isRepairGridFrozen,
    },
  );
