/**
 * Unbox / History / Testing spreadsheet column model — SoT for receiving-line
 * LedgerGrid surfaces that are not Incoming POS.
 *
 * Same spreadsheet family as Pending / Incoming (Date as a per-row column —
 * no sticky day-band headers on these rails):
 *   select · title · date · qty · cond · stage · platform · order · tracking · serial
 *
 * Incoming keeps its own Expected / Age / Status columns
 * ({@link INCOMING_GRID_COLUMNS}). Stage label (Unboxed / Scanned / Tested) is
 * a header prop — the track key stays `stage`. Date is the civil day of the
 * activity-axis stamp (Unboxed / Scanned / Tested).
 */

import {
  gridContentMinWidthRem,
  gridHeaderShowsLabel,
  gridTemplate,
} from '@/design-system/components/grid/grid-column-geometry';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';

export type ReceivingGridColumnKey =
  | 'select'
  | 'title'
  | 'date'
  | 'qty'
  | 'condition'
  | 'stage'
  | 'platform'
  | 'order'
  | 'tracking'
  | 'serial';

/**
 * EXTENDS the house model — it does not re-declare it. Every shared field
 * (`width` · `label` · `gridLabel` · `labelFitRem` · `type` · `align` ·
 * `omitCellIcon` · `hideKey` · `tier`) is inherited, so a new presentation
 * field lands once on `LedgerGridColumnModel` instead of being re-typed in
 * each of the five surface layouts. Only `key` narrows, plus genuinely
 * receiving-specific fields.
 */
export interface ReceivingGridColumn extends Omit<LedgerGridColumnModel, 'key'> {
  key: ReceivingGridColumnKey;
  /** When false, header is not click-to-sort (select gutter only). Default true for data cols. */
  sortable?: boolean;
}

/**
 * Canonical Unbox / History / Testing columns. Fact tracks are content-hard
 * `minmax(X,X)`; only `title` flexes. `order` hides under legacy `orderid`;
 * `stage` hides under meta `rest`.
 *
 * ## Default (`core`) set — deliberately lean
 *
 * A receiving line is scanned by: what is it (`title`), when did it land
 * (`date`), how many (`qty`), where is it in the flow (`stage`), and the two
 * identifiers an operator actually types or scans (`order` = PO#, `tracking`).
 * That is the whole default grid.
 *
 * `condition`, `platform` and `serial` are `optional` — not because they are
 * unimportant, but because on THIS surface they are usually empty at the moment
 * the row is being scanned (condition and serial are set during unbox; platform
 * is secondary to the PO/tracking identity). A column that is blank for most
 * rows costs horizontal budget and scan attention for nothing. Staff who work a
 * lane where they matter turn them on once, and it follows them across devices.
 */
export const RECEIVING_GRID_COLUMNS: readonly ReceivingGridColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', sortable: false },
  {
    key: 'title',
    width: 'minmax(12rem, 1fr)',
    label: 'Product Title',
    gridLabel: 'Product',
    type: 'text',
    labelFitRem: 8,
  },
  // Civil day of the activity-axis stamp — Pending/Incoming Date column recipe.
  { key: 'date', width: 'minmax(4.5rem, 4.5rem)', label: 'Date', gridLabel: 'Date', type: 'date', labelFitRem: 4.5 },
  // 3.5rem / fit 3.5 matches the Pending grid exactly, so the header reads
  // `Qty` instead of a bare `#`. The glyph fallback was ambiguous here: the
  // type registry maps BOTH `number` and `id` to the hash mark, so a label-less
  // qty column was indistinguishable from the Order column two tracks over.
  { key: 'qty', width: 'minmax(3.5rem, 3.5rem)', label: 'Qty', type: 'number', hideKey: 'qty', labelFitRem: 3.5 },
  { key: 'condition', width: 'minmax(5.5rem, 5.5rem)', label: 'Cond', type: 'tag', hideKey: 'condition', tier: 'optional', labelFitRem: 4.5 },
  // Stage clock — hide with meta `rest`. The track is sized for the RUNTIME
  // label (`Unboxed` / `Scanned` / `Tested`, injected by the header's
  // `stageLabel` prop), not for the placeholder `Stage` declared here: at
  // 4.5rem the 7-character stage names clipped to `UNBO…`. 5rem clears the
  // longest of them (`gridHeaderLabelFits`), and the label-aware fit test now
  // degrades to the clock glyph rather than clipping if a longer one appears.
  { key: 'stage', width: 'minmax(5rem, 5rem)', label: 'Stage', type: 'date', hideKey: 'rest', labelFitRem: 4.5 },
  { key: 'platform', width: 'minmax(3rem, 3rem)', label: 'Platform', gridLabel: 'Ch.', type: 'external', hideKey: 'platform', tier: 'optional', labelFitRem: 4.5 },
  { key: 'order', width: 'minmax(4.5rem, 4.5rem)', label: 'Order', type: 'id', hideKey: 'orderid', labelFitRem: 4.5 },
  { key: 'tracking', width: 'minmax(5.75rem, 5.75rem)', label: 'Tracking', type: 'location', omitCellIcon: true, hideKey: 'tracking', labelFitRem: 4.5 },
  { key: 'serial', width: 'minmax(5.75rem, 5.75rem)', label: 'Serial', type: 'id', hideKey: 'serial', tier: 'optional', labelFitRem: 4.5 },
] as const;

const RECEIVING_GRID_LOCKED_KEYS: readonly ReceivingGridColumnKey[] = ['select', 'title'];

/** Data columns that support click-to-sort (excludes select). */
const RECEIVING_GRID_SORTABLE_KEYS: readonly ReceivingGridColumnKey[] = RECEIVING_GRID_COLUMNS.filter(
  (c) => c.sortable !== false && c.key !== 'select',
).map((c) => c.key);

export function isReceivingGridSortable(key: string): key is ReceivingGridColumnKey {
  return (RECEIVING_GRID_SORTABLE_KEYS as readonly string[]).includes(key);
}

// Geometry delegates to the shared waist — these stay as named aliases so the
// surface's call sites keep reading receiving-flavoured names.
export const receivingGridHeaderShowsLabel = gridHeaderShowsLabel;

export function receivingContentMinWidthRem(
  columns: readonly ReceivingGridColumn[] = RECEIVING_GRID_COLUMNS,
): number {
  return gridContentMinWidthRem(columns);
}

export function receivingGridTemplate(
  columns: readonly ReceivingGridColumn[] = RECEIVING_GRID_COLUMNS,
): string {
  return gridTemplate(columns);
}

export function isReceivingGridFrozen(key: string): boolean {
  return RECEIVING_GRID_LOCKED_KEYS.includes(key as ReceivingGridColumnKey);
}

export type ReceivingGridSortDir = 'asc' | 'desc';

/** Default direction when first activating a column sort. */
export function defaultDirForReceivingGridSort(key: ReceivingGridColumnKey): ReceivingGridSortDir {
  // Date / stage: most recent first (ops scan).
  if (key === 'date' || key === 'stage') return 'desc';
  return 'asc';
}

// (flipReceivingGridSortDir retired — the TanStack sort surface owns the
//  asc ↔ desc cycle via LedgerGridSurface / useGridSurface.)

// Shared spreadsheet chrome — same helpers as outbound OrdersGridView / Incoming.
export {
  ORDERS_QUEUE_FROZEN_CELL as RECEIVING_GRID_FROZEN_CELL,
  ordersQueueFrozenLeft as receivingGridFrozenLeft,
  ordersQueueGridCell as receivingGridCell,
  ordersQueueRowShellClass as receivingGridRowShellClass,
} from '@/lib/dashboard-order-row-layout';
