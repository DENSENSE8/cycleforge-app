/**
 * Warehouse › Bins spreadsheet column model — MATERIALIZED from a
 * {@link SlotLayout}, never a hand array.
 *
 * A row is one bin with pre-computed fill / stale / low / over-capacity flags —
 * a pickable inventory map with bulk membership (label / cycle-count actions),
 * not a work-item queue. The static `BINS_GRID_COLUMNS` died with wave 1.4 of
 * the seller-table program: tracks whose keys WERE fields (`fill`,
 * `last_counted`, `status`) are a frozen layout no organization can capture.
 *
 * What remains STRUCTURAL is the sheet skeleton — the frozen `select` gutter
 * (live multi-select) and the frozen, flexing `barcode` identity track
 * (`bins.barcode` is the fact it resolves). Everything after it is a catalog
 * fact an org/staffer binds.
 *
 * Sort and frozen-offset helpers derive from the MOUNTED model, never a module
 * constant.
 */

import {
  gridFrozenLeft,
  gridTemplate,
} from '@/design-system/components/grid/grid-column-geometry';
import { BINS_FIELD_CATALOG, BINS_PRODUCT_LAYOUT } from '@/lib/tables/field-catalog/bins';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type BinsGridColumnKey =
  | 'select'
  | 'barcode'
  /** Materialized slot tracks — keys are slot indices, never field ids. */
  | `status:${number}`
  | `subtitle:${number}`;

export interface BinsGridColumn extends SlotTrackFields {
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
 * The structural sheet skeleton — what Bins paints with ZERO bindings.
 * `barcode` is the only flex track; the frozen pane is `select · barcode`.
 */
const BINS_SHEET_BASE: readonly BinsGridColumn[] = [
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
];

/**
 * Materialize the mounted bins columns from an effective layout. Both bands
 * anchor on `barcode`, so the default plate reads location · SKUs · qty · fill
 * · counted · status — the retired hand model's scan order.
 */
export function binsSheetColumnsFor(layout: SlotLayout): readonly BinsGridColumn[] {
  return materializeTracks<BinsGridColumn>({
    layout,
    catalog: BINS_FIELD_CATALOG,
    base: BINS_SHEET_BASE,
    statusAnchorKey: 'barcode',
    subtitleAnchorKey: 'barcode',
  });
}

/**
 * The PRODUCT-DEFAULT materialization — what an org with no override mounts,
 * the canonical columns of the bins binding, and the guard SoT.
 */
export const BINS_SHEET_COLUMNS: readonly BinsGridColumn[] =
  binsSheetColumnsFor(BINS_PRODUCT_LAYOUT);

/**
 * The FACT a column sorts by, or null when it offers no sort.
 *
 * `bins.status` is deliberately unsortable wherever it is bound: it is a
 * COMPOSITE of four independent flags, so ordering it would compare whichever
 * flag happened to be first. That rule belongs to the FACT, not to a track key
 * — a rebind must carry it.
 */
export function binsSortFactFor(col: BinsGridColumn): string | null {
  if (col.sortable === false || col.key === 'select') return null;
  if (col.key === 'barcode') return 'bins.barcode';
  if (col.fieldId === 'bins.status') return null;
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isBinsColumnSortable(
  columns: readonly BinsGridColumn[],
  key: string,
): key is BinsGridColumnKey {
  return columns.some((c) => c.key === key && binsSortFactFor(c) !== null);
}

/** CSS grid template — one `var(--cf-col-<key>, <width>)` track per column. */
export function binsGridTemplate(
  columns: readonly BinsGridColumn[] = BINS_SHEET_COLUMNS,
): string {
  return gridTemplate(columns);
}

/** Sticky offset for a frozen cell, derived from the MOUNTED model. */
export function binsGridFrozenLeft(
  columns: readonly BinsGridColumn[],
  key: BinsGridColumnKey,
): string {
  return gridFrozenLeft(columns, key);
}

/**
 * Default direction on first activation: magnitudes and dates read
 * newest/biggest first, names and ids alphabetically.
 */
export function defaultDirForBinsColumn(
  columns: readonly BinsGridColumn[],
  key: string,
): GridSortDir {
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}

// Shared spreadsheet chrome — @/design-system/components/grid ledgerGridCell.
export {
  LEDGER_GRID_FROZEN_CELL as BINS_GRID_FROZEN_CELL,
  ledgerGridCell as binsGridCell,
  ledgerGridRowShellClass as binsGridRowShellClass,
} from '@/design-system/components/grid/grid-cell-chrome';
