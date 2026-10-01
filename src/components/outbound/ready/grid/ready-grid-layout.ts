/** Ready / recently-tested sheet column model — MATERIALIZED from a {@link DataTableColumnLayout}, never a hand array. */

import { gridFrozenLeft, gridTemplate } from '@/design-system/components/grid/grid-column-geometry';
import { READY_FIELD_CATALOG, READY_PRODUCT_LAYOUT } from '@/lib/tables/field-catalog/ready';
import { materializeTracks, type DataTableColumnFields } from '@/lib/tables/materialize-tracks';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type ReadyGridColumnKey =
  | 'select'
  | 'title'
  /** The Stage-FBA escape — structural capability, never an org column. */
  | 'action'
  /** Materialized slot tracks — keys are slot indices, never field ids. */
  | `status:${number}`
  | `subtitle:${number}`;

export interface ReadyGridColumn extends DataTableColumnFields { key: ReadyGridColumnKey;
width: string;
label?: string;
gridLabel?: string;
labelFitRem?: number;
type?: ColumnType;
/** Justification override — see {@link LedgerGridColumnModel.align}. */
align?: 'start' | 'end';
/** Part of the frozen identity pane — see {@link LedgerGridColumnModel.frozen}. */
frozen?: boolean;
minTrackRem?: number;
resizable?: boolean;
/** When false, header is not click-to-sort (gutter / action tracks). */
sortable?: boolean; }

/**
 * The structural sheet skeleton — what Ready paints with ZERO bindings.
 * `title` is the only flex track; the frozen pane is `select · title`; the
 * Stage-FBA `action` track closes the row. Slot bands insert between them.
 */
const READY_SHEET_BASE: readonly ReadyGridColumn[] = [
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
  // Action track — structural, no glyph type, never sortable.
  { key: 'action', width: 'minmax(6.5rem, 6.5rem)', sortable: false },
];

/** Materialize the mounted Ready columns from an effective layout. */
export function readySheetColumnsFor(layout: DataTableColumnLayout): readonly ReadyGridColumn[] { return materializeTracks<ReadyGridColumn>({
  layout,
  catalog: READY_FIELD_CATALOG,
  base: READY_SHEET_BASE,
  statusAnchorKey: 'title',
  subtitleAnchorKey: 'title',
}); }

/** The PRODUCT-DEFAULT materialization — what an org with no override mounts (`select · title · verdict · destination · cond · tested ·… */
export const READY_SHEET_COLUMNS: readonly ReadyGridColumn[] =
  readySheetColumnsFor(READY_PRODUCT_LAYOUT);

/** The FACT a column sorts by, or null when it offers no sort. */
export function readySortFactFor(col: ReadyGridColumn): string | null {
  if (col.sortable === false || col.key === 'select' || col.key === 'action') return null;
  if (col.key === 'title') return 'title';
  if (col.fieldId === 'ready.reasons') return null;
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isReadyColumnSortable(
  columns: readonly ReadyGridColumn[],
  key: string,
): key is ReadyGridColumnKey {
  return columns.some((c) => c.key === key && readySortFactFor(c) !== null);
}

/**
 * Default direction when first activating a column sort: tested history and
 * other magnitudes read newest/biggest first (`date` / `money` / `number`
 * display types), names and ids alphabetically.
 */
export function defaultDirForReadyColumn(
  columns: readonly ReadyGridColumn[],
  key: string,
): GridSortDir {
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}

/** CSS grid template — one `var(--cf-col-<key>, <width>)` track per column. */
export function readyGridTemplate(
  columns: readonly ReadyGridColumn[] = READY_SHEET_COLUMNS,
): string {
  return gridTemplate(columns);
}

/** Sticky offset for a frozen cell, derived from the MOUNTED model. */
export function readyGridFrozenLeft(
  columns: readonly ReadyGridColumn[],
  key: ReadyGridColumnKey,
): string {
  return gridFrozenLeft(columns, key);
}

// Shared spreadsheet chrome — @/design-system/components/grid ledgerGridCell.
export {
  LEDGER_GRID_FROZEN_CELL as READY_GRID_FROZEN_CELL,
  ledgerGridCell as readyGridCell,
  ledgerGridRowShellClass as readyGridRowShellClass,
} from '@/design-system/components/grid/grid-cell-chrome';
