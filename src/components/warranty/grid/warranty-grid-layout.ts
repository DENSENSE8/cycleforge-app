/** Warranty claims spreadsheet column model — MATERIALIZED from a {@link DataTableColumnLayout}, never a hand array (the warranty-native sibling of shipped). */

import {
  gridFrozenLeft,
  gridTemplate,
} from '@/design-system/components/grid/grid-column-geometry';
import {
  WARRANTY_FIELD_CATALOG,
  WARRANTY_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/warranty';
import { materializeTracks, type DataTableColumnFields } from '@/lib/tables/materialize-tracks';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type WarrantyGridColumnKey =
  | 'select'
  | 'title'
  /** The claim number — structural identity track; `warranty.claim` resolves it. */
  | 'claim'
  /** Row-scoped ticket control — a capability, never an org column. */
  | 'ticket'
  /** Materialized slot tracks — keys are slot indices, never field ids. */
  | `status:${number}`
  | `subtitle:${number}`;

export interface WarrantyGridColumn extends DataTableColumnFields { key: WarrantyGridColumnKey;
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
sortable?: boolean; }

/**
 * The structural sheet skeleton — what Warranty paints with ZERO bindings.
 * `title` is the only flex track; the frozen pane is `select · title`; the
 * Claim identity track rides beside it and the ticket action closes the row.
 */
const WARRANTY_SHEET_BASE: readonly WarrantyGridColumn[] = [
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
  {
    key: 'claim',
    width: 'minmax(8rem, 8rem)',
    label: 'Claim',
    gridLabel: 'Claim',
    type: 'id',
    labelFitRem: 4.5,
  },
  // Action track — no glyph type, never sortable, never offered in Fields.
  { key: 'ticket', width: 'minmax(2.5rem, 2.5rem)', sortable: false },
];

/**
 * Materialize the mounted warranty columns from an effective layout. Both bands
 * anchor on `claim`, so the default plate reads customer · status · warranty ·
 * logged — the retired hand model's core view — with `ticket` always last.
 */
export function warrantySheetColumnsFor(layout: DataTableColumnLayout): readonly WarrantyGridColumn[] { return materializeTracks<WarrantyGridColumn>({
  layout,
  catalog: WARRANTY_FIELD_CATALOG,
  base: WARRANTY_SHEET_BASE,
  statusAnchorKey: 'claim',
  subtitleAnchorKey: 'claim',
}); }

/**
 * The PRODUCT-DEFAULT materialization — what an org with no override mounts,
 * the canonical columns of the warranty binding, and the guard SoT.
 */
export const WARRANTY_SHEET_COLUMNS: readonly WarrantyGridColumn[] =
  warrantySheetColumnsFor(WARRANTY_PRODUCT_LAYOUT);

/** The FACT a column sorts by, or null when it offers no sort. */
export function warrantySortFactFor(col: WarrantyGridColumn): string | null {
  if (col.sortable === false || col.key === 'select' || col.key === 'ticket') return null;
  if (col.key === 'title') return 'title';
  if (col.key === 'claim') return 'warranty.claim';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isWarrantyColumnSortable(
  columns: readonly WarrantyGridColumn[],
  key: string,
): key is WarrantyGridColumnKey {
  return columns.some((c) => c.key === key && warrantySortFactFor(c) !== null);
}

/** CSS grid template — one `var(--cf-col-<key>, <width>)` track per column. */
export function warrantyGridTemplate(
  columns: readonly WarrantyGridColumn[] = WARRANTY_SHEET_COLUMNS,
): string {
  return gridTemplate(columns);
}

/** Sticky offset for a frozen cell, derived from the MOUNTED model. */
export function warrantyGridFrozenLeft(
  columns: readonly WarrantyGridColumn[],
  key: WarrantyGridColumnKey,
): string {
  return gridFrozenLeft(columns, key);
}

/**
 * Default direction on first activation: magnitudes and dates read
 * newest/biggest first, names and ids alphabetically.
 */
export function defaultDirForWarrantyColumn(
  columns: readonly WarrantyGridColumn[],
  key: string,
): GridSortDir {
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}

// Shared spreadsheet chrome — @/design-system/components/grid ledgerGridCell.
export {
  LEDGER_GRID_FROZEN_CELL as WARRANTY_GRID_FROZEN_CELL,
  ledgerGridCell as warrantyGridCell,
  ledgerGridRowShellClass as warrantyGridRowShellClass,
} from '@/design-system/components/grid/grid-cell-chrome';
