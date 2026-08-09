'use client';

import { Calendar, Clock } from '@/components/Icons';
import {
  makeLedgerGridColumnHeader,
  type LedgerHeaderLayoutApi,
} from '@/design-system/components/grid';
import {
  INCOMING_GRID_COLUMNS,
  INCOMING_GRID_FROZEN_CELL,
  incomingGridCell,
  incomingGridFrozenLeft,
  incomingGridRowShellClass,
  incomingGridTemplate,
  isIncomingGridFrozen,
  isIncomingGridSortable,
  type IncomingGridColumn,
  type IncomingGridColumnKey,
} from '@/lib/receiving/incoming-grid-layout';

const INCOMING_HEADER_LAYOUT: LedgerHeaderLayoutApi<IncomingGridColumn> = {
  template: incomingGridTemplate,
  cellClass: incomingGridCell,
  rowShellClass: incomingGridRowShellClass,
  frozenCellClass: INCOMING_GRID_FROZEN_CELL,
  frozenLeft: incomingGridFrozenLeft,
  isFrozen: isIncomingGridFrozen,
  isSortable: isIncomingGridSortable,
  // Sheets-class (Unbox golden): only the select gutter is frozen — edge cue hangs there.
  frozenEdgeKey: 'select',
};

/**
 * Sticky column header for the Incoming LedgerGrid. `selectMode: 'prop'` — the
 * surface mounts both with and without row selection, so the caller decides.
 */
export const IncomingGridColumnHeader = makeLedgerGridColumnHeader<
  IncomingGridColumn,
  IncomingGridColumnKey,
  'prop'
>({
  layout: INCOMING_HEADER_LAYOUT,
  defaultColumns: INCOMING_GRID_COLUMNS,
  selectMode: 'prop',
  // Desk default; embed mounts pass `tableId="incoming_embed"`.
  tableId: 'incoming',
  glyphFor: (column) =>
    column.key === 'date' ? (
      <Calendar className="h-3 w-3 shrink-0 text-text-faint" aria-hidden />
    ) : column.key === 'age' ? (
      <Clock className="h-3 w-3 shrink-0 text-text-faint" aria-hidden />
    ) : undefined,
});
