/**
 * Incoming POS grid surface descriptor (plan Phase C) — lifts the house
 * `INCOMING_GRID_COLUMNS` SoT into the TanStack defs `LedgerGridSurface`
 * mounts. Sorting stays inside the incoming sort vocabulary
 * (`isIncomingGridSortable`); row ORDER stays with the house comparator
 * (`compareIncomingGridRows`) — the defs are state math only.
 */

import { makeGridSurfaceDescriptor, type GridSurfaceDescriptor } from '@/design-system/components/grid';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import {
  INCOMING_GRID_COLUMNS,
  defaultDirForIncomingGridSort,
  incomingContentMinWidthRem,
  isIncomingGridFrozen,
  isIncomingGridSortable,
  type IncomingGridColumn,
} from '@/lib/receiving/incoming-grid-layout';

export const INCOMING_GRID_DESCRIPTOR: GridSurfaceDescriptor<ReceivingLineRow, IncomingGridColumn> =
  makeGridSurfaceDescriptor<ReceivingLineRow, IncomingGridColumn>(
    'inbound.incoming',
    INCOMING_GRID_COLUMNS,
    incomingContentMinWidthRem(INCOMING_GRID_COLUMNS),
    {
      isSortable: isIncomingGridSortable,
      sortDescFirst: (key) => defaultDirForIncomingGridSort(key) === 'desc',
      isLocked: isIncomingGridFrozen,
    },
  );
