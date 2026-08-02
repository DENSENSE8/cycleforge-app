'use client';

import { Clock } from '@/components/Icons';
import {
  makeLedgerGridColumnHeader,
  type GridColumnHeaderProps,
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
};

const BaseReceivingGridColumnHeader = makeLedgerGridColumnHeader<
  ReceivingGridColumn,
  ReceivingGridColumnKey,
  'prop'
>({
  layout: RECEIVING_HEADER_LAYOUT,
  defaultColumns: RECEIVING_GRID_COLUMNS,
  selectMode: 'prop',
  glyphFor: (column) =>
    column.key === 'stage' ? (
      <Clock className="h-3 w-3 shrink-0 text-text-faint" aria-hidden />
    ) : undefined,
});

/**
 * Sticky column header for Unbox / History / Testing.
 *
 * This is the one family that keeps a hand-written wrapper, and the reason is
 * `stageLabel`: the same `stage` TRACK renders as Unboxed / Scanned / Tested
 * depending on which rail mounted it, so the label is per-MOUNT state, not a
 * family constant like Repair's glyphs. The wrapper translates it into the
 * factory's `labelFor` prop and forwards everything else untouched.
 */
export function ReceivingGridColumnHeader({
  stageLabel = 'Stage',
  ...rest
}: GridColumnHeaderProps<ReceivingGridColumn, ReceivingGridColumnKey, 'prop'> & {
  /** Overrides the `stage` column header label (Unboxed / Scanned / Tested). */
  stageLabel?: string;
}) {
  return (
    <BaseReceivingGridColumnHeader
      {...rest}
      labelFor={(column) => (column.key === 'stage' ? stageLabel : undefined)}
    />
  );
}
