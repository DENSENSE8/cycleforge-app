/**
 * Incoming POS spreadsheet column model — SoT for `/incoming` LedgerGrid.
 *
 * Same spreadsheet family as Pending, plus a receiving-specific Status track
 * (delivery_state + confidence chips):
 *   select · title · date · age · qty · cond · status · platform · order · tracking
 *
 * Receiving-specific facts map onto Pending tracks (expected date, delivery age,
 * PO as order). Status stays its own column — never folded into Product Title.
 */

import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import { ordersQueueColVar } from '@/lib/dashboard-order-row-layout';

export type IncomingGridColumnKey =
  | 'select'
  | 'title'
  | 'date'
  | 'age'
  | 'qty'
  | 'condition'
  | 'status'
  | 'platform'
  | 'order'
  | 'tracking';

/** Extends the house model — see {@link LedgerGridColumnModel}; only `key` narrows. */
export interface IncomingGridColumn extends Omit<LedgerGridColumnModel, 'key'> {
  key: IncomingGridColumnKey;
  /** When false, header is not click-to-sort (select gutter only). Default true for data cols. */
  sortable?: boolean;
}

/**
 * Canonical Incoming columns — same keys / widths / types as
 * {@link ORDERS_QUEUE_COLUMNS}. Fact tracks are content-hard `minmax(X,X)`;
 * only `title` flexes. `order` hides under legacy `orderid`.
 *
 * ## Default (`core`) set — deliberately lean
 *
 * An inbound line is scanned by: what is it (`title`), when is it due
 * (`date` = Expected), how overdue (`age`), how many (`qty`), where is the
 * delivery (`status`), and the two identifiers an operator types or scans
 * (`order` = PO#, `tracking`). That is the whole default grid.
 *
 * `condition` and `platform` are `optional`. On THIS surface a line has not
 * arrived yet — `condition_grade` is set during unbox/triage, so the Cond cell
 * is the empty dash for nearly every row, and the source channel is secondary
 * to the PO/tracking identity the operator actually acts on. A column that is
 * blank for most rows costs horizontal budget and scan attention for nothing.
 *
 * **Tier must match {@link RECEIVING_GRID_COLUMNS} key-for-key.** Incoming
 * mounts under `TableColumnConfigProvider tableId="receiving"`
 * (ReceivingLinesTable), so `qty` · `condition` · `rest` · `platform` ·
 * `orderid` · `tracking` are the SAME stored pref keys Unbox / History use. Tier
 * is what the staff delta is read against (`optional` ⇒ opt-in via `shown`,
 * `core` ⇒ opt-out via `hidden`) — marking a key `optional` here and `core`
 * there would give one stored key two meanings depending on which mode you are
 * looking at. Changing a tier is a both-grids change (or a split onto a distinct
 * `TableId`), never an Incoming-local one.
 */
export const INCOMING_GRID_COLUMNS: readonly IncomingGridColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', sortable: false },
  {
    key: 'title',
    width: 'minmax(12rem, 1fr)',
    label: 'Product Title',
    gridLabel: 'Product',
    type: 'text',
    labelFitRem: 8,
  },
  // Expected / PO civil date — Pending's "Ship by" / By track.
  { key: 'date', width: 'minmax(4.5rem, 4.5rem)', label: 'Expected', gridLabel: 'By', type: 'date', labelFitRem: 4.5 },
  { key: 'age', width: 'minmax(3rem, 3rem)', label: 'Age', type: 'date', labelFitRem: 4.5 },
  { key: 'qty', width: 'minmax(2.75rem, 2.75rem)', label: 'Qty', type: 'number', hideKey: 'qty', labelFitRem: 4.5 },
  { key: 'condition', width: 'minmax(5.5rem, 5.5rem)', label: 'Cond', type: 'tag', hideKey: 'condition', tier: 'optional', labelFitRem: 4.5 },
  // Receiving-specific delivery status (hide with meta `rest` in TableColumnConfig).
  // Icon + short Seller claim only (city stays in tooltip).
  { key: 'status', width: 'minmax(4.5rem, 4.5rem)', label: 'Status', type: 'tag', hideKey: 'rest', labelFitRem: 4.5 },
  { key: 'platform', width: 'minmax(3rem, 3rem)', label: 'Platform', gridLabel: 'Ch.', type: 'external', hideKey: 'platform', tier: 'optional', labelFitRem: 4.5 },
  // Wide enough for plain last-4 mono (no truncate ellipsis).
  { key: 'order', width: 'minmax(4.5rem, 4.5rem)', label: 'Order', type: 'id', hideKey: 'orderid', labelFitRem: 4.5 },
  // Fits + TRK# attach face (chip-size AddValueChipFace ~62px + cell pad).
  { key: 'tracking', width: 'minmax(5.75rem, 5.75rem)', label: 'Tracking', type: 'location', omitCellIcon: true, hideKey: 'tracking', labelFitRem: 4.5 },
] as const;

export const INCOMING_GRID_LOCKED_KEYS: readonly IncomingGridColumnKey[] = ['select', 'title'];

/** Data columns that support click-to-sort (excludes select). */
export const INCOMING_GRID_SORTABLE_KEYS: readonly IncomingGridColumnKey[] = INCOMING_GRID_COLUMNS.filter(
  (c) => c.sortable !== false && c.key !== 'select',
).map((c) => c.key);

export function isIncomingGridSortable(key: string): key is IncomingGridColumnKey {
  return (INCOMING_GRID_SORTABLE_KEYS as readonly string[]).includes(key);
}

/** Parse rem floor from a track string. */
export function incomingGridColumnTrackRem(column: IncomingGridColumn): number {
  const m = column.width.match(/([\d.]+)rem/);
  return m ? Number(m[1]) : 12;
}

export function incomingGridHeaderShowsLabel(column: IncomingGridColumn): boolean {
  const fit = column.labelFitRem ?? 4.5;
  return incomingGridColumnTrackRem(column) >= fit;
}

export function incomingContentMinWidthRem(
  columns: readonly IncomingGridColumn[] = INCOMING_GRID_COLUMNS,
): number {
  return columns.reduce((sum, c) => sum + incomingGridColumnTrackRem(c), 0);
}

export function incomingGridTemplate(
  columns: readonly IncomingGridColumn[] = INCOMING_GRID_COLUMNS,
): string {
  return columns.map((c) => `var(${ordersQueueColVar(c.key)}, ${c.width})`).join(' ');
}

export function isIncomingGridFrozen(key: string): boolean {
  return INCOMING_GRID_LOCKED_KEYS.includes(key as IncomingGridColumnKey);
}

export type IncomingGridSortDir = 'asc' | 'desc';

/** Default direction when first activating a column sort. */
export function defaultDirForIncomingGridSort(key: IncomingGridColumnKey): IncomingGridSortDir {
  // Age: most overdue / oldest first (urgency scan), matching Pending.
  if (key === 'age') return 'desc';
  return 'asc';
}

export function flipIncomingGridSortDir(dir: IncomingGridSortDir): IncomingGridSortDir {
  return dir === 'asc' ? 'desc' : 'asc';
}

/** Civil date source for the Date column (expected → PO → created). */
export function incomingRowDateSource(row: {
  expected_delivery_date?: string | null;
  po_date?: string | null;
  created_at?: string | null;
}): string | null {
  return (
    (row.expected_delivery_date || '').trim() ||
    (row.po_date || '').trim() ||
    (row.created_at || '').trim() ||
    null
  );
}

// Shared spreadsheet chrome — same helpers as outbound OrdersGridView.
export {
  ORDERS_QUEUE_FROZEN_CELL as INCOMING_GRID_FROZEN_CELL,
  ordersQueueFrozenLeft as incomingGridFrozenLeft,
  ordersQueueGridCell as incomingGridCell,
  ordersQueueRowShellClass as incomingGridRowShellClass,
} from '@/lib/dashboard-order-row-layout';
