/** Inventory › Units spreadsheet column model — MATERIALIZED from a {@link SlotLayout}, never a hand array. */

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

/** Materialize the mounted units columns from an effective layout. */
export function unitsSheetColumnsFor(layout: SlotLayout): readonly UnitsGridColumn[] {
  return materializeTracks<UnitsGridColumn>({
    layout,
    catalog: UNITS_FIELD_CATALOG,
    base: UNITS_SHEET_BASE,
    statusAnchorKey: 'product',
    subtitleAnchorKey: 'product',
  });
}

/** The PRODUCT-DEFAULT materialization — what an org with no override mounts (`serial · product · status · condition · location · updated`,… */
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
