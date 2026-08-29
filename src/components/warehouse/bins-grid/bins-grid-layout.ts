/**
 * Warehouse › Bins spreadsheet column model.
 *
 * A row is one bin with pre-computed fill / stale / low / over-capacity flags —
 * a pickable inventory map with bulk membership (label / cycle-count actions),
 * not a work-item queue. Columns: Barcode · Room/Location · SKUs · Qty · Fill ·
 * Counted · Status — over the SAME shared geometry every other house spreadsheet
 * uses.
 *
 * Frozen pane = `select` (live multi-select gutter) + `barcode` (identity).
 */

import { gridFrozenKeys } from '@/design-system/components/grid/grid-column-editability';
import {
  gridFrozenLeft,
  gridTemplate,
} from '@/design-system/components/grid/grid-column-geometry';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type BinsGridColumnKey =
  | 'select'
  | 'barcode'
  | 'location'
  | 'sku_count'
  | 'total_qty'
  | 'fill'
  | 'last_counted'
  | 'status';

export interface BinsGridColumn {
  key: BinsGridColumnKey;
  width: string;
  label?: string;
  gridLabel?: string;
  labelFitRem?: number;
  type?: ColumnType;
  /** Justification override — see {@link LedgerGridColumnModel.align}. */
  align?: 'start' | 'end';
  /** Part of the frozen identity pane — see {@link LedgerGridColumnModel.frozen}. */
  frozen?: boolean;
  /** Staff-preference key (`staff_preferences.tableColumns.bins`). */
  hideKey?: string;
  /** `core` ships ON (opt-out); `optional` ships OFF (opt-in via Fields). */
  tier?: 'core' | 'optional';
  /** When false, header is not click-to-sort (gutter / chip-list tracks). */
  sortable?: boolean;
}

/**
 * Canonical bins columns. Only `barcode` flexes; facts are content-hard.
 *
 * DEFAULT VIEW is the full set — every track answers a question the warehouse
 * operator asks while scanning the floor map (which bin, where, how full, when
 * last counted, what flags). Nothing here is drill-down rationale.
 */
export const BINS_GRID_COLUMNS: readonly BinsGridColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', sortable: false, frozen: true },
  {
    key: 'barcode',
    frozen: true,
    width: 'minmax(8rem, 1fr)',
    label: 'Barcode',
    gridLabel: 'Barcode',
    type: 'id',
    labelFitRem: 5,
  },
  {
    key: 'location',
    width: 'minmax(9rem, 9rem)',
    label: 'Room / Location',
    gridLabel: 'Location',
    type: 'location',
    hideKey: 'location',
    labelFitRem: 5.5,
  },
  {
    key: 'sku_count',
    width: 'minmax(4rem, 4rem)',
    label: 'SKUs',
    type: 'number',
    hideKey: 'sku_count',
    labelFitRem: 3,
  },
  {
    key: 'total_qty',
    width: 'minmax(4rem, 4rem)',
    label: 'Qty',
    type: 'number',
    hideKey: 'total_qty',
    labelFitRem: 2.5,
  },
  {
    key: 'fill',
    width: 'minmax(8rem, 8rem)',
    label: 'Fill',
    // Bar + pct label — not a digit column the operator compares end-aligned.
    type: 'text',
    hideKey: 'fill',
    labelFitRem: 2.5,
  },
  {
    key: 'last_counted',
    width: 'minmax(5.5rem, 5.5rem)',
    label: 'Counted',
    type: 'date',
    hideKey: 'last_counted',
    labelFitRem: 4.5,
  },
  {
    key: 'status',
    width: 'minmax(8rem, 8rem)',
    label: 'Status',
    type: 'tag',
    hideKey: 'status',
    // Composite chip list — sorting by first flag would be arbitrary.
    sortable: false,
    labelFitRem: 4,
  },
] as const;

/** Frozen identity pane — `select · barcode`, derived from the model's own flag. */
const BINS_GRID_LOCKED_KEYS: readonly BinsGridColumnKey[] = gridFrozenKeys(BINS_GRID_COLUMNS);

const BINS_GRID_SORTABLE_KEYS: readonly BinsGridColumnKey[] = BINS_GRID_COLUMNS.filter(
  (c) => c.sortable !== false && c.key !== 'select',
).map((c) => c.key);

export function isBinsGridSortable(key: string): key is BinsGridColumnKey {
  return (BINS_GRID_SORTABLE_KEYS as readonly string[]).includes(key);
}

export function isBinsGridFrozen(key: string): boolean {
  return BINS_GRID_LOCKED_KEYS.includes(key as BinsGridColumnKey);
}

/** CSS grid template — one `var(--cf-col-<key>, <width>)` track per column. */
export function binsGridTemplate(
  columns: readonly BinsGridColumn[] = BINS_GRID_COLUMNS,
): string {
  return gridTemplate(columns);
}

/** Sticky offset for a frozen cell — row px + the widths of the locked columns before it. */
export function binsGridFrozenLeft(key: BinsGridColumnKey): string {
  return gridFrozenLeft(BINS_GRID_COLUMNS, key);
}


/** Default direction on first activation — location A→Z; counted newest-first. */
export function defaultDirForBinsGridSort(key: BinsGridColumnKey): GridSortDir {
  if (key === 'last_counted') return 'desc';
  return 'asc';
}

// Shared spreadsheet chrome — @/design-system/components/grid ledgerGridCell.
export {
  LEDGER_GRID_FROZEN_CELL as BINS_GRID_FROZEN_CELL,
  ledgerGridCell as binsGridCell,
  ledgerGridRowShellClass as binsGridRowShellClass,
} from '@/design-system/components/grid/grid-cell-chrome';
