'use client';

import {
  makeLedgerGridColumnHeader,
  type LedgerHeaderLayoutApi,
} from '@/design-system/components/grid';
import {
  RECEIVING_GRID_COLUMNS,
  RECEIVING_GRID_FROZEN_CELL,
  receivingGridCell,
  receivingGridFrozenLeft,
  receivingGridRowShellClass,
  receivingGridTemplate,
  isReceivingGridFrozen,
  isReceivingGridSortable,
  type ReceivingGridColumn,
  type ReceivingGridColumnKey,
} from '@/lib/receiving/receiving-grid-layout';

const RECEIVING_HEADER_LAYOUT: LedgerHeaderLayoutApi<ReceivingGridColumn> = {
  template: receivingGridTemplate,
  cellClass: receivingGridCell,
  rowShellClass: receivingGridRowShellClass,
  frozenCellClass: RECEIVING_GRID_FROZEN_CELL,
  frozenLeft: receivingGridFrozenLeft,
  isFrozen: isReceivingGridFrozen,
  isSortable: isReceivingGridSortable,
  // Sheets-class: only the select gutter is frozen — edge cue hangs there.
  frozenEdgeKey: 'select',
};

/**
 * Sticky column header for Unbox / History / Testing.
 *
 * This family kept a hand-written wrapper until 2026-08-02, and its only job
 * was the `stage` track: a `stageLabel` prop relabelled that header per MOUNT
 * (Unboxed / Scanned / Tested) and a `glyphFor` gave it a clock. The column is
 * gone — the stamp lives in `date`, the stage name in `status` — so the wrapper
 * is the plain factory result. Labels come from the column SoT, like every
 * sibling family.
 */
export const ReceivingGridColumnHeader = makeLedgerGridColumnHeader<
  ReceivingGridColumn,
  ReceivingGridColumnKey,
  'prop'
>({
  layout: RECEIVING_HEADER_LAYOUT,
  defaultColumns: RECEIVING_GRID_COLUMNS,
  selectMode: 'prop',
});
