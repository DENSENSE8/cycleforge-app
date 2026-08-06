/**
 * Local Pickup spreadsheet column model — the pickup-native sibling of
 * {@link RECEIVING_GRID_COLUMNS}. Pickup rows are LCPU order *items* (read-only:
 * no unbox/serial/receive lifecycle, no inline title PATCH), so this is a
 * deliberately smaller column set than receiving — Product · SKU · Order · Date ·
 * Qty · Cond · Price · Status — but it composes the SAME shared geometry
 * (`receivingGridCell` / `RECEIVING_GRID_FROZEN_CELL`) so a
 * pickup grid lines up pixel-for-pixel with every other station spreadsheet.
 *
 * Frozen pane = `select` (empty gutter, keeps the station left rhythm) + `title`
 * (the flexing product cell). `order` is the LCPU PO# — the one-to-many fold key.
 * Title is identity — never in-cell editable ({@link GRID_IDENTITY_COLUMN_KEYS}).
 */

import { gridFrozenKeys } from '@/design-system/components/grid/grid-column-editability';
import {
  gridFrozenLeft,
  gridTemplate,
} from '@/design-system/components/grid/grid-column-geometry';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

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
  /** Justification override — see {@link LedgerGridColumnModel.align}. */
  align?: 'start' | 'end';
  /** Part of the frozen identity pane — see {@link LedgerGridColumnModel.frozen}. */
  frozen?: boolean;
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
  { key: 'select', width: 'minmax(2rem, 2rem)', sortable: false, frozen: true },
  {
    key: 'title',
    frozen: true,
    width: 'minmax(12rem, 1fr)',
    label: 'Product',
    gridLabel: 'Product',
    type: 'text',
    labelFitRem: 8,
  },
  { key: 'sku', width: 'minmax(7rem, 7rem)', label: 'SKU', type: 'id', hideKey: 'sku', tier: 'optional', labelFitRem: 4.5 },
  { key: 'order', width: 'minmax(9rem, 9rem)', label: 'Order', type: 'id', hideKey: 'order', labelFitRem: 4.5 },
  { key: 'date', width: 'minmax(5.5rem, 5.5rem)', label: 'Date', type: 'date', hideKey: 'date', labelFitRem: 4.5 },
  // 3.5rem / fit 3.5 matches Pending, Unbox and Incoming so the header reads `Qty`
  // rather than a bare `#` — the type registry maps both `number` and `id` to the
  // hash mark, so a label-less numeric column is indistinguishable from an id one.
  { key: 'qty', width: 'minmax(3.5rem, 3.5rem)', label: 'Qty', type: 'number', hideKey: 'qty', tier: 'optional', labelFitRem: 3.5 },
  { key: 'condition', width: 'minmax(5.5rem, 5.5rem)', label: 'Cond', type: 'tag', hideKey: 'condition', tier: 'optional', labelFitRem: 4.5 },
  { key: 'price', width: 'minmax(5rem, 5rem)', label: 'Price', type: 'price', hideKey: 'price', tier: 'optional', labelFitRem: 4.5 },
  { key: 'status', width: 'minmax(5rem, 5rem)', label: 'Status', type: 'tag', hideKey: 'status', labelFitRem: 4.5 },
] as const;

/**
 * Frozen identity pane — `select · title`. Derived from the column model's
 * `frozen` flag (one declaration for freeze + immovability + offset math), not
 * from the house key list: the pane is a per-surface answer, and Orders already
 * freezes a third track. See `grid-column-editability.ts`.
 */
const PICKUP_GRID_LOCKED_KEYS: readonly PickupGridColumnKey[] = gridFrozenKeys(PICKUP_GRID_COLUMNS);

const PICKUP_GRID_SORTABLE_KEYS: readonly PickupGridColumnKey[] = PICKUP_GRID_COLUMNS.filter(
  (c) => c.sortable !== false && c.key !== 'select',
).map((c) => c.key);

export function isPickupGridSortable(key: string): key is PickupGridColumnKey {
  return (PICKUP_GRID_SORTABLE_KEYS as readonly string[]).includes(key);
}

export function isPickupGridFrozen(key: string): boolean {
  return PICKUP_GRID_LOCKED_KEYS.includes(key as PickupGridColumnKey);
}


/** CSS grid template — one `var(--cf-col-<key>, <width>)` track per column. */
export function pickupGridTemplate(
  columns: readonly PickupGridColumn[] = PICKUP_GRID_COLUMNS,
): string {
  return gridTemplate(columns);
}

/**
 * Sticky offset for a frozen cell — row px + the summed widths of the locked
 * columns that precede it — bound to {@link PICKUP_GRID_COLUMNS}, so this
 * surface's own pane and widths drive the offset.
 */
export function pickupGridFrozenLeft(key: PickupGridColumnKey): string {
  return gridFrozenLeft(PICKUP_GRID_COLUMNS, key);
}


/** Default direction when first activating a column sort (date/price → desc). */
export function defaultDirForPickupGridSort(key: PickupGridColumnKey): GridSortDir {
  if (key === 'date' || key === 'price' || key === 'qty') return 'desc';
  return 'asc';
}

// Shared spreadsheet chrome — @/design-system/components/grid ledgerGridCell.
export {
  LEDGER_GRID_FROZEN_CELL as PICKUP_GRID_FROZEN_CELL,
  ledgerGridCell as pickupGridCell,
  ledgerGridRowShellClass as pickupGridRowShellClass,
} from '@/design-system/components/grid/grid-cell-chrome';
