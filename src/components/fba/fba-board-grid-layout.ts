/**
 * FBA shipment board — the column model, replacing the hand-rolled track
 * template.
 *
 * ## Why this exists
 *
 * The board was the last surface reaching `LedgerGrid` without one. It carried a
 * literal `grid-cols-[2.5rem_5.5rem_minmax(12rem,1.4fr)_…]` string and a
 * `columnHeader` of ten bare `<span>`s, which means the widths and the labels
 * were two declarations of the same ten columns with nothing tying them
 * together: adding a column meant editing a Tailwind arbitrary value AND a span
 * list, and getting either wrong shifted every header one track out of line
 * against its cells.
 *
 * `fba-board-capabilities.ts` said exactly this and deferred it — "the column
 * model + descriptor are the board's migration wave". This is that wave.
 *
 * ## What is deliberately NOT here
 *
 * No `hideKey` on any column. The board has no column-display lip and no
 * `staff_preferences.tableColumns` entry, so every track is structural — and a
 * `hideKey` naming a bucket nothing writes would be a Fields menu entry that
 * cannot persist. `FBA_BOARD_GRID_CAPABILITIES` already declares
 * `fieldsMenu: false`; this agrees with it rather than contradicting it.
 */

import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';

export type FbaBoardGridColumnKey =
  | 'select'
  | 'asin'
  | 'title'
  | 'fnsku'
  | 'qty'
  | 'status'
  | 'condition'
  | 'due'
  | 'plan'
  | 'details';

export interface FbaBoardGridColumn extends Omit<LedgerGridColumnModel, 'key'> {
  key: FbaBoardGridColumnKey;
}

/**
 * The ten tracks, in scan order.
 *
 * Widths are the ones the literal template carried — this is a transcription,
 * not a redesign, so the board's geometry is byte-identical after the port. The
 * `type` on each is new and is what now derives alignment
 * (`resolveGridColumnAlign`): `qty` is a magnitude and ends up right-aligned,
 * where the hand-rolled header left it flush left against right-aligned cells.
 */
export const FBA_BOARD_GRID_COLUMNS: readonly FbaBoardGridColumn[] = [
  { key: 'select', width: 'minmax(2.5rem, 2.5rem)', frozen: true, resizable: false },
  {
    key: 'asin',
    width: 'minmax(5.5rem, 5.5rem)',
    label: 'ASIN',
    type: 'id',
    frozen: true,
    resizable: false,
    labelFitRem: 4,
  },
  {
    key: 'title',
    // The one flex track. A second would mean neither absorbs the sheet's slack
    // predictably — `table-definition.ts` refuses a model with two.
    width: 'minmax(12rem, 1.4fr)',
    label: 'Title',
    type: 'text',
    frozen: true,
    resizable: true,
    labelFitRem: 4,
  },
  {
    key: 'fnsku',
    width: 'minmax(6.5rem, 6.5rem)',
    label: 'FNSKU',
    type: 'id',
    resizable: false,
    labelFitRem: 4.5,
  },
  {
    key: 'qty',
    width: 'minmax(4.5rem, 4.5rem)',
    label: 'Qty',
    type: 'number',
    resizable: false,
    labelFitRem: 3,
  },
  {
    key: 'status',
    width: 'minmax(5.5rem, 5.5rem)',
    label: 'Status',
    type: 'tag',
    resizable: false,
    labelFitRem: 4,
  },
  {
    key: 'condition',
    width: 'minmax(5rem, 5rem)',
    label: 'Condition',
    type: 'tag',
    resizable: false,
    labelFitRem: 4,
  },
  {
    key: 'due',
    width: 'minmax(4rem, 4rem)',
    label: 'Due',
    type: 'date',
    dateFace: 'day',
    resizable: false,
    labelFitRem: 3,
  },
  {
    key: 'plan',
    width: 'minmax(5rem, 5rem)',
    label: 'Plan',
    type: 'text',
    resizable: false,
    labelFitRem: 3.5,
  },
  { key: 'details', width: 'minmax(2.5rem, 2.5rem)', resizable: false },
] as const;

/** Sortable tracks — the header factory's `isSortable`. */
export function isFbaBoardGridSortable(key: string): boolean {
  return key === 'asin' || key === 'title' || key === 'qty' || key === 'due';
}
