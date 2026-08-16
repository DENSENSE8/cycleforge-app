/**
 * Warranty claims spreadsheet column model — the warranty-native sibling of
 * {@link PICKUP_GRID_COLUMNS}.
 *
 * A claim row is a support record, not a station line: no unbox/serial/receive
 * lifecycle, no in-cell edit, no fold. So this is a small, read-only column set
 * — Item · Claim · Customer · Status · Warranty · Logged — composing the SAME
 * shared geometry (`receivingGridCell` /
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

import { makeGridLayout } from '@/design-system/components/grid/make-grid-layout';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

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
 * Layout DERIVED from the column model — template, sticky offsets, frozen and
 * sortable answers, default sort direction. The hand-written versions of these
 * were the same six functions in every family with the names swapped; see
 * `make-grid-layout.ts` for the breakdown and `make-grid-layout.test.ts` for
 * the goldens that pinned the outputs across this migration.
 */
const WARRANTY_GRID_LAYOUT = makeGridLayout<WarrantyGridColumn>({
  columns: WARRANTY_GRID_COLUMNS,
  descFirstKeys: ['logged'],
});

/** Narrowing wrapper — the derived answer, with this family's key type. */
export function isWarrantyGridSortable(key: string): key is WarrantyGridColumnKey {
  return WARRANTY_GRID_LAYOUT.isSortable(key);
}

export function isWarrantyGridFrozen(key: string): boolean {
  return WARRANTY_GRID_LAYOUT.isFrozen(key);
}

/** CSS grid template — one `var(--cf-col-<key>, <width>)` track per column. */
export function warrantyGridTemplate(
  columns: readonly WarrantyGridColumn[] = WARRANTY_GRID_COLUMNS,
): string {
  return WARRANTY_GRID_LAYOUT.template(columns);
}

/** Sticky offset for a frozen cell — row px + the locked widths before it. */
export function warrantyGridFrozenLeft(key: WarrantyGridColumnKey): string {
  return WARRANTY_GRID_LAYOUT.frozenLeft(key);
}

export function defaultDirForWarrantyGridSort(key: WarrantyGridColumnKey): GridSortDir {
  return WARRANTY_GRID_LAYOUT.defaultDir(key);
}

// Shared spreadsheet chrome — @/design-system/components/grid ledgerGridCell.
export {
  LEDGER_GRID_FROZEN_CELL as WARRANTY_GRID_FROZEN_CELL,
  ledgerGridCell as warrantyGridCell,
  ledgerGridRowShellClass as warrantyGridRowShellClass,
} from '@/design-system/components/grid/grid-cell-chrome';
