/**
 * Warranty claims spreadsheet column model — the warranty-native sibling of
 * {@link PICKUP_GRID_COLUMNS}.
 *
 * A claim row is a support record, not a station line: no unbox/serial/receive
 * lifecycle, no in-cell edit, no fold. So this is a small, read-only column set
 * — Item · Claim · Customer · Status · Warranty · Logged — composing the SAME
 * shared geometry (`ordersQueueColVar` / `receivingGridCell` /
 * `ORDERS_QUEUE_FROZEN_CELL`) so the warranty grid lines up pixel-for-pixel with
 * every other house spreadsheet.
 *
 * Frozen pane = `select` (empty gutter, keeps the left rhythm) + `title` (the
 * flexing item cell). Title is identity — never in-cell editable
 * ({@link GRID_IDENTITY_COLUMN_KEYS}); a claim is corrected at the record plane
 * (the `?open=` detail panel).
 *
 * `ticket` is an ACTION track, not a fact: it carries no `hideKey`, so it is
 * structural (`isGridColumnVisible` rule 1) and the Fields menu never offers it.
 * Row-scoped actions must not be something a staffer can hide and then wonder
 * where the control went.
 */

import { gridFrozenKeys } from '@/design-system/components/grid/grid-column-editability';
import { gridTemplate } from '@/design-system/components/grid/grid-column-geometry';
import { ordersQueueColVar } from '@/lib/dashboard-order-row-layout';
import type { ColumnType } from '@/lib/tables/table-columns';

export type WarrantyGridColumnKey =
  | 'select'
  | 'title'
  | 'claim'
  | 'serial'
  | 'customer'
  | 'status'
  | 'warranty'
  | 'logged'
  | 'ticket';

export interface WarrantyGridColumn {
  key: WarrantyGridColumnKey;
  width: string;
  label?: string;
  gridLabel?: string;
  labelFitRem?: number;
  type?: ColumnType;
  /** Justification override — see {@link LedgerGridColumnModel.align}. */
  align?: 'start' | 'end';
  /** Part of the frozen identity pane — see {@link LedgerGridColumnModel.frozen}. */
  frozen?: boolean;
  /** Staff-preference key (`staff_preferences.tableColumns.warranty`). */
  hideKey?: string;
  /** `core` ships ON (opt-out); `optional` ships OFF (opt-in via Fields). */
  tier?: 'core' | 'optional';
  /** When false, header is not click-to-sort (gutter / action tracks). Default true. */
  sortable?: boolean;
}

/**
 * Canonical warranty columns. Only `title` flexes; facts are content-hard.
 *
 * DEFAULT VIEW (tier `core`) is `select · title · claim · customer · status ·
 * warranty · logged` — the five questions a support operator on a phone call
 * actually asks: what is it, which claim, whose is it, what state is it in, how
 * much cover is left, and when was it logged. `serial` is `optional`: it is the
 * lookup key you arrive BY (the sidebar search already matches it), not one you
 * scan down a column, and it duplicates the item cell on most rows.
 */
export const WARRANTY_GRID_COLUMNS: readonly WarrantyGridColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', sortable: false, frozen: true },
  {
    key: 'title',
    frozen: true,
    width: 'minmax(12rem, 1fr)',
    label: 'Item',
    gridLabel: 'Item',
    type: 'text',
    labelFitRem: 8,
  },
  { key: 'claim', width: 'minmax(8rem, 8rem)', label: 'Claim', type: 'id', hideKey: 'claim', labelFitRem: 4.5 },
  {
    key: 'serial',
    width: 'minmax(8rem, 8rem)',
    label: 'Serial',
    type: 'id',
    hideKey: 'serial',
    tier: 'optional',
    labelFitRem: 4.5,
  },
  { key: 'customer', width: 'minmax(8rem, 8rem)', label: 'Customer', type: 'text', hideKey: 'customer', labelFitRem: 4.5 },
  { key: 'status', width: 'minmax(6rem, 6rem)', label: 'Status', type: 'tag', hideKey: 'status', labelFitRem: 4.5 },
  {
    key: 'warranty',
    width: 'minmax(6.5rem, 6.5rem)',
    label: 'Warranty',
    // The clock chip is categorical ("14d left" / "Expired"), not a figure the
    // operator compares digit-by-digit — so it reads as a tag and start-aligns
    // with Status beside it. Sorting still runs on `daysRemaining`.
    type: 'tag',
    hideKey: 'warranty',
    labelFitRem: 5.5,
  },
  { key: 'logged', width: 'minmax(5.5rem, 5.5rem)', label: 'Logged', type: 'date', hideKey: 'logged', labelFitRem: 4.5 },
  // Action track — no hideKey (structural), no type glyph, never sortable.
  { key: 'ticket', width: 'minmax(2.5rem, 2.5rem)', sortable: false },
] as const;

/**
 * Frozen identity pane — `select · title`. Derived from the model's `frozen`
 * flag (one declaration for freeze + immovability + offset math), never a
 * re-typed key list.
 */
const WARRANTY_GRID_LOCKED_KEYS: readonly WarrantyGridColumnKey[] =
  gridFrozenKeys(WARRANTY_GRID_COLUMNS);

const WARRANTY_GRID_SORTABLE_KEYS: readonly WarrantyGridColumnKey[] = WARRANTY_GRID_COLUMNS.filter(
  (c) => c.sortable !== false && c.key !== 'select',
).map((c) => c.key);

export function isWarrantyGridSortable(key: string): key is WarrantyGridColumnKey {
  return (WARRANTY_GRID_SORTABLE_KEYS as readonly string[]).includes(key);
}

export function isWarrantyGridFrozen(key: string): boolean {
  return WARRANTY_GRID_LOCKED_KEYS.includes(key as WarrantyGridColumnKey);
}

/** CSS grid template — one `var(--cf-col-<key>, <width>)` track per column. */
export function warrantyGridTemplate(
  columns: readonly WarrantyGridColumn[] = WARRANTY_GRID_COLUMNS,
): string {
  return gridTemplate(columns);
}

// Row left-pad — same token every house grid uses so the frozen gutter aligns.
const WARRANTY_GRID_ROW_PX = 'var(--cf-queue-row-px, calc(0.75rem * var(--cf-density, 1)))';

/**
 * Sticky offset for a frozen cell — row px + the summed widths of the locked
 * columns before it. Self-computed over {@link WARRANTY_GRID_COLUMNS} so this
 * surface's own select/title widths drive the offset.
 */
export function warrantyGridFrozenLeft(key: WarrantyGridColumnKey): string {
  const idx = WARRANTY_GRID_LOCKED_KEYS.indexOf(key);
  const parts = [WARRANTY_GRID_ROW_PX];
  for (const k of WARRANTY_GRID_LOCKED_KEYS.slice(0, Math.max(0, idx))) {
    const col = WARRANTY_GRID_COLUMNS.find((c) => c.key === k);
    parts.push(`var(${ordersQueueColVar(k)}, ${col?.width ?? '0px'})`);
  }
  return `calc(${parts.join(' + ')})`;
}

export type WarrantyGridSortDir = 'asc' | 'desc';

/**
 * Default direction when first activating a column sort.
 *
 * `logged` → newest first, the usual date reading. `warranty` → **ascending**,
 * because the column holds days REMAINING: fewest-days-left first puts the
 * claims about to fall out of cover at the top, which is the only reason to
 * sort that column at all.
 */
export function defaultDirForWarrantyGridSort(key: WarrantyGridColumnKey): WarrantyGridSortDir {
  if (key === 'logged') return 'desc';
  return 'asc';
}

// Shared spreadsheet chrome — the SAME helpers the receiving/outbound grids use.
export {
  ORDERS_QUEUE_FROZEN_CELL as WARRANTY_GRID_FROZEN_CELL,
  ordersQueueGridCell as warrantyGridCell,
  ordersQueueRowShellClass as warrantyGridRowShellClass,
} from '@/lib/dashboard-order-row-layout';
