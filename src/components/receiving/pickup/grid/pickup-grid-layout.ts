/**
 * Local Pickup spreadsheet column model — the pickup-native sibling of
 * {@link RECEIVING_GRID_COLUMNS}. Pickup rows are LCPU order *items* (read-only:
 * no unbox/serial/receive lifecycle, no inline title PATCH), so this is a
 * deliberately smaller column set than receiving — Product · SKU · Order · Date ·
 * Qty · Cond · Price · Status — but it composes the SAME shared geometry
 * (`ordersQueueColVar` / `receivingGridCell` / `RECEIVING_GRID_FROZEN_CELL`) so a
 * pickup grid lines up pixel-for-pixel with every other station spreadsheet.
 *
 * Frozen pane = `select` (empty gutter, keeps the station left rhythm) + `title`
 * (the flexing product cell). `order` is the LCPU PO# — the one-to-many fold key.
 */

import type { ColumnType } from '@/lib/tables/table-columns';
import { ordersQueueColVar } from '@/lib/dashboard-order-row-layout';

export type PickupGridColumnKey =
  | 'select'
  | 'title'
  | 'sku'
  | 'order'
  | 'date'
  | 'qty'
  | 'condition'
  | 'price'
  | 'status';

export interface PickupGridColumn {
  key: PickupGridColumnKey;
  width: string;
  label?: string;
  gridLabel?: string;
  labelFitRem?: number;
  type?: ColumnType;
  /** Staff-preference key (`staff_preferences.tableColumns.pickup`). */
  hideKey?: string;
  /** `core` ships ON (opt-out); `optional` ships OFF (opt-in via Fields). */
  tier?: 'core' | 'optional';
  /** When false, header is not click-to-sort (select gutter only). Default true. */
  sortable?: boolean;
}

/**
 * Canonical Local Pickup columns. Only `title` flexes; facts are content-hard.
 *
 * DEFAULT VIEW (tier `core`) is `select · title · order · date · status` — the
 * counter operator's four questions: what, which LCPU order, when it's being
 * picked up, and is it still Draft. `sku` / `qty` / `condition` / `price` are
 * line detail that the group summary already rolls up and the detail pane shows
 * in full, so they ship `optional` rather than widening every first load.
 */
export const PICKUP_GRID_COLUMNS: readonly PickupGridColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', sortable: false },
  {
    key: 'title',
    width: 'minmax(12rem, 1fr)',
    label: 'Product',
    gridLabel: 'Product',
    type: 'text',
    labelFitRem: 8,
  },
  { key: 'sku', width: 'minmax(7rem, 7rem)', label: 'SKU', type: 'id', hideKey: 'sku', tier: 'optional', labelFitRem: 4.5 },
  { key: 'order', width: 'minmax(9rem, 9rem)', label: 'Order', type: 'id', hideKey: 'order', labelFitRem: 4.5 },
  { key: 'date', width: 'minmax(5.5rem, 5.5rem)', label: 'Date', type: 'date', hideKey: 'date', labelFitRem: 4.5 },
  { key: 'qty', width: 'minmax(2.75rem, 2.75rem)', label: 'Qty', type: 'number', hideKey: 'qty', tier: 'optional', labelFitRem: 4.5 },
  { key: 'condition', width: 'minmax(5.5rem, 5.5rem)', label: 'Cond', type: 'tag', hideKey: 'condition', tier: 'optional', labelFitRem: 4.5 },
  { key: 'price', width: 'minmax(5rem, 5rem)', label: 'Price', type: 'number', hideKey: 'price', tier: 'optional', labelFitRem: 4.5 },
  { key: 'status', width: 'minmax(5rem, 5rem)', label: 'Status', type: 'tag', hideKey: 'status', labelFitRem: 4.5 },
] as const;

const PICKUP_GRID_LOCKED_KEYS: readonly PickupGridColumnKey[] = ['select', 'title'];

const PICKUP_GRID_SORTABLE_KEYS: readonly PickupGridColumnKey[] = PICKUP_GRID_COLUMNS.filter(
  (c) => c.sortable !== false && c.key !== 'select',
).map((c) => c.key);

export function isPickupGridSortable(key: string): key is PickupGridColumnKey {
  return (PICKUP_GRID_SORTABLE_KEYS as readonly string[]).includes(key);
}

export function isPickupGridFrozen(key: string): boolean {
  return PICKUP_GRID_LOCKED_KEYS.includes(key as PickupGridColumnKey);
}

function pickupGridColumnTrackRem(column: PickupGridColumn): number {
  const m = column.width.match(/([\d.]+)rem/);
  return m ? Number(m[1]) : 12;
}

export function pickupGridHeaderShowsLabel(column: PickupGridColumn): boolean {
  const fit = column.labelFitRem ?? 4.5;
  return pickupGridColumnTrackRem(column) >= fit;
}

export function pickupContentMinWidthRem(
  columns: readonly PickupGridColumn[] = PICKUP_GRID_COLUMNS,
): number {
  return columns.reduce((sum, c) => sum + pickupGridColumnTrackRem(c), 0);
}

/** CSS grid template — one `var(--cf-col-<key>, <width>)` track per column. */
export function pickupGridTemplate(
  columns: readonly PickupGridColumn[] = PICKUP_GRID_COLUMNS,
): string {
  return columns.map((c) => `var(${ordersQueueColVar(c.key)}, ${c.width})`).join(' ');
}

// Row left-pad — same token every station grid uses so the frozen gutter aligns.
const PICKUP_GRID_ROW_PX = 'var(--cf-queue-row-px, calc(0.75rem * var(--cf-density, 1)))';

/**
 * Sticky offset for a frozen cell — row px + the summed widths of the locked
 * columns that precede it. Self-computed over {@link PICKUP_GRID_COLUMNS} (not
 * `ordersQueueFrozenLeft`, whose fallbacks read the ORDERS widths) so pickup's
 * own select/title widths drive the offset.
 */
export function pickupGridFrozenLeft(key: PickupGridColumnKey): string {
  const idx = PICKUP_GRID_LOCKED_KEYS.indexOf(key);
  const parts = [PICKUP_GRID_ROW_PX];
  for (const k of PICKUP_GRID_LOCKED_KEYS.slice(0, Math.max(0, idx))) {
    const col = PICKUP_GRID_COLUMNS.find((c) => c.key === k);
    parts.push(`var(${ordersQueueColVar(k)}, ${col?.width ?? '0px'})`);
  }
  return `calc(${parts.join(' + ')})`;
}

export type PickupGridSortDir = 'asc' | 'desc';

/** Default direction when first activating a column sort (date/price → desc). */
export function defaultDirForPickupGridSort(key: PickupGridColumnKey): PickupGridSortDir {
  if (key === 'date' || key === 'price' || key === 'qty') return 'desc';
  return 'asc';
}

// Shared spreadsheet chrome — the SAME helpers the receiving/outbound grids use.
export {
  ORDERS_QUEUE_FROZEN_CELL as PICKUP_GRID_FROZEN_CELL,
  ordersQueueGridCell as pickupGridCell,
  ordersQueueRowShellClass as pickupGridRowShellClass,
} from '@/lib/dashboard-order-row-layout';
