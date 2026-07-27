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

/**
 * Build the Incoming descriptor from a RESOLVED column list.
 *
 * Takes the columns rather than reading the SoT constant so `contentMinWidthRem`
 * (the h-scroll activation width) and the TanStack defs follow whatever
 * `useGridColumnVisibility` resolved — hiding a track shrinks the grid instead
 * of leaving a dead ruled band the width of the column that used to be there.
 */
export function makeIncomingGridDescriptor(
  columns: readonly IncomingGridColumn[] = INCOMING_GRID_COLUMNS,
): GridSurfaceDescriptor<ReceivingLineRow, IncomingGridColumn> {
  return makeGridSurfaceDescriptor<ReceivingLineRow, IncomingGridColumn>(
    'inbound.incoming',
    columns,
    incomingContentMinWidthRem(columns),
    {
      isSortable: isIncomingGridSortable,
      sortDescFirst: (key) => defaultDirForIncomingGridSort(key) === 'desc',
      isLocked: isIncomingGridFrozen,
    },
  );
}
