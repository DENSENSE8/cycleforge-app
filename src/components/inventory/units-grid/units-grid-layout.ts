/**
 * Inventory › Units spreadsheet column model — MATERIALIZED from a
 * {@link SlotLayout}, never a hand array.
 *
 * A row is one serialized unit — the browse/collection map for `/inventory`.
 * The static `UNITS_GRID_COLUMNS` died with wave 1.4 of the seller-table
 * program: tracks whose keys WERE fields (`status`, `condition`, `location`)
 * are a frozen layout no organization can capture as `tableLayouts` and no
 * staffer can rebind without a deploy.
 *
 * What remains STRUCTURAL is the sheet skeleton — the frozen `serial` pane (the
 * unit's own scannable handle; `units.serial` is the identity fact it resolves)
 * and the flexing `product` track (title over SKU, one identity read). Browse-
 * only: no multi-select gutter yet, so there is no `select` column and the
 * frozen pane is the single identity track. Everything after Product is a
 * catalog fact an org/staffer binds.
 *
 * Sort and frozen-offset helpers derive from the MOUNTED model, never a module
 * constant — a key-only closure over a static list is how offsets and
 * sortability go stale the moment the mounted model moves.
 */

import {
  gridFrozenLeft,
  gridTemplate,
} from '@/design-system/components/grid/grid-column-geometry';
import { UNITS_FIELD_CATALOG, UNITS_PRODUCT_LAYOUT } from '@/lib/tables/field-catalog/units';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type UnitsGridColumnKey =
  | 'serial'
  | 'product'
  /** Materialized slot tracks — keys are slot indices, never field ids. */
  | `status:${number}`
  | `subtitle:${number}`;

export interface UnitsGridColumn extends SlotTrackFields {
  key: UnitsGridColumnKey;
  width: string;
  label?: string;
  gridLabel?: string;
  labelFitRem?: number;
  type?: ColumnType;
  /** Justification override — see {@link LedgerGridColumnModel.align}. */
  align?: 'start' | 'end';
  /** Part of the frozen identity pane — see {@link LedgerGridColumnModel.frozen}. */
  frozen?: boolean;
  /** Staff-preference key (`staff_preferences.tableColumns.inventory_units`). */
  hideKey?: string;
  /** `core` ships ON (opt-out); `optional` ships OFF (opt-in via Fields). */
  tier?: 'core' | 'optional';
  /** When false, header is not click-to-sort. */
  sortable?: boolean;
}

/**
 * The structural sheet skeleton — what Units paints with ZERO bindings.
 * `product` is the only flex track; the frozen pane is `serial` alone.
 */
const UNITS_SHEET_BASE: readonly UnitsGridColumn[] = [
  {
    key: 'serial',
    frozen: true,
    width: 'minmax(9rem, 9rem)',
    label: 'Serial',
    gridLabel: 'Serial',
    type: 'id',
    labelFitRem: 4,
  },
  {
    key: 'product',
    width: 'minmax(12rem, 1fr)',
    label: 'Product',
    gridLabel: 'Product',
    type: 'text',
    labelFitRem: 5,
  },
];

/**
 * Materialize the mounted units columns from an effective layout. Both bands
 * anchor on `product`: subtitles land directly after it, the status band after
 * those — so the default plate reads status · condition · location · updated,
 * exactly the retired hand model's scan order.
 */
export function unitsSheetColumnsFor(layout: SlotLayout): readonly UnitsGridColumn[] {
  return materializeTracks<UnitsGridColumn>({
    layout,
    catalog: UNITS_FIELD_CATALOG,
    base: UNITS_SHEET_BASE,
    statusAnchorKey: 'product',
    subtitleAnchorKey: 'product',
  });
}

/**
 * The PRODUCT-DEFAULT materialization — what an org with no override mounts
 * (`serial · product · status · condition · location · updated`, the retired
 * hand model's full set), the canonical columns of the units binding, and the
 * guard SoT.
 */
export const UNITS_SHEET_COLUMNS: readonly UnitsGridColumn[] =
  unitsSheetColumnsFor(UNITS_PRODUCT_LAYOUT);

/**
 * The FACT a column sorts by, or null when it offers no sort: the structural
 * tracks map to their own facts, slot tracks to their bound field id.
 */
export function unitsSortFactFor(col: UnitsGridColumn): string | null {
  if (col.sortable === false) return null;
  if (col.key === 'serial') return 'units.serial';
  if (col.key === 'product') return 'product';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isUnitsColumnSortable(
  columns: readonly UnitsGridColumn[],
  key: string,
): key is UnitsGridColumnKey {
  return columns.some((c) => c.key === key && unitsSortFactFor(c) !== null);
}

/** CSS grid template — one `var(--cf-col-<key>, <width>)` track per column. */
export function unitsGridTemplate(
  columns: readonly UnitsGridColumn[] = UNITS_SHEET_COLUMNS,
): string {
  return gridTemplate(columns);
}

/** Sticky offset for a frozen cell, derived from the MOUNTED model. */
export function unitsGridFrozenLeft(
  columns: readonly UnitsGridColumn[],
  key: UnitsGridColumnKey,
): string {
  return gridFrozenLeft(columns, key);
}

/**
 * Default direction on first activation: magnitudes and dates read
 * newest/biggest first, names and ids alphabetically.
 */
export function defaultDirForUnitsColumn(
  columns: readonly UnitsGridColumn[],
  key: string,
): GridSortDir {
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}

// Shared spreadsheet chrome — @/design-system/components/grid ledgerGridCell.
export {
  LEDGER_GRID_FROZEN_CELL as UNITS_GRID_FROZEN_CELL,
  ledgerGridCell as unitsGridCell,
  ledgerGridRowShellClass as unitsGridRowShellClass,
} from '@/design-system/components/grid/grid-cell-chrome';
