/**
 * CSV import staging spreadsheet column model — the triage map an operator
 * reads BEFORE anything is written to To-Ship.
 *
 * A row is one parsed CSV record projected through the current column mapping
 * (`listCsvImportStagingRows`). The `status` track is the **triage state**
 * (Ready · Action required) — a fact with its own column, never a dot parked in
 * the identity cell (`source-of-truth.md` → Grid ROW anatomy).
 *
 * Frozen pane = `select` + `order`: the order number is this surface's unique
 * row handle, exactly as the PO is on Unbox History. `status` is structural
 * (no `hideKey`) — a triage queue whose triage state can be hidden is a queue
 * that can lie about why Confirm skipped a row.
 */

import {
  gridFrozenLeft,
  gridTemplate,
} from '@/design-system/components/grid/grid-column-geometry';
import { GRID_FILL_COLUMN } from '@/design-system/components/grid';
import {
  ORDERS_IMPORT_FIELD_CATALOG,
  ORDERS_IMPORT_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/orders-import';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type CsvImportStagingGridColumnKey =
  | 'select'
  | 'order'
  /** Ready / Action-required — structural; the whole point of this surface. */
  | 'status'
  /** Trailing slack owner — the house law's sole `1fr`. */
  | '_fill'
  /** Materialized slot tracks — keys are slot indices, never field ids. */
  | `status:${number}`
  | `subtitle:${number}`;

export interface CsvImportStagingGridColumn extends SlotTrackFields {
  key: CsvImportStagingGridColumnKey;
  width: string;
  label?: string;
  gridLabel?: string;
  labelFitRem?: number;
  type?: ColumnType;
  /** Drag-resize / drain floor in rem — see {@link LedgerGridColumnModel.minTrackRem}. */
  minTrackRem?: number;
  /** Justification override — see {@link LedgerGridColumnModel.align}. */
  align?: 'start' | 'end';
  /** Part of the frozen identity pane — see {@link LedgerGridColumnModel.frozen}. */
  frozen?: boolean;
  /** Staff-preference key (`staff_preferences.tableColumns['orders-import']`). */
  hideKey?: string;
  /** `core` ships ON (opt-out); `optional` ships OFF (opt-in via Fields). */
  tier?: 'core' | 'optional';
  /** When false, header is not click-to-sort (gutter track). */
  sortable?: boolean;
}

/**
 * The structural sheet skeleton — what staging paints with ZERO bindings.
 *
 * `select · order` is the frozen identity pane; `status` is the triage state,
 * structural because a staffer who could unbind it would be looking at an
 * import queue that no longer says which rows block the commit.
 *
 * **The port's one geometry change, with its reason.** The retired hand model
 * hung the sheet's sole `1fr` on the `customer` track, which "absorbs the
 * sheet's slack". `customer` is a FACT, so it is now a bound track sized by its
 * display type — and a sheet with no flex track leaves its slack unallocated.
 * The trailing `_fill` takes it instead, which is the house law every other
 * family already follows (`GRID_FILL_COLUMN`): geometry only, no label, no
 * hideKey, never in Fields.
 */
const CSV_IMPORT_STAGING_SHEET_BASE: readonly CsvImportStagingGridColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', sortable: false, frozen: true },
  {
    key: 'order',
    frozen: true,
    width: 'minmax(9rem, 9rem)',
    label: 'Order number',
    gridLabel: 'Order',
    type: 'id',
    labelFitRem: 5,
  },
  {
    key: 'status',
    width: 'minmax(9rem, 9rem)',
    label: 'Status',
    gridLabel: 'Status',
    type: 'tag',
    labelFitRem: 4.5,
  },
  { ...GRID_FILL_COLUMN, key: '_fill' as const },
];

/**
 * Materialize the mounted staging columns from an effective layout. Both bands
 * anchor on `status`, so the default plate reads sku · qty · customer ·
 * tracking · platform — the retired hand model's order — with `_fill` last.
 */
export function csvImportStagingSheetColumnsFor(
  layout: SlotLayout,
): readonly CsvImportStagingGridColumn[] {
  return materializeTracks<CsvImportStagingGridColumn>({
    layout,
    catalog: ORDERS_IMPORT_FIELD_CATALOG,
    base: CSV_IMPORT_STAGING_SHEET_BASE,
    statusAnchorKey: 'status',
    subtitleAnchorKey: 'status',
  });
}

/**
 * The PRODUCT-DEFAULT materialization — what an org with no override mounts,
 * the canonical columns of the staging binding, and the guard SoT.
 */
export const CSV_IMPORT_STAGING_SHEET_COLUMNS: readonly CsvImportStagingGridColumn[] =
  csvImportStagingSheetColumnsFor(ORDERS_IMPORT_PRODUCT_LAYOUT);

/** The FACT a column sorts by, or null when it offers no sort. */
export function csvImportStagingSortFactFor(
  col: CsvImportStagingGridColumn,
): string | null {
  if (col.sortable === false || col.key === 'select' || col.key === '_fill') return null;
  if (col.key === 'order') return 'orders-import.order';
  if (col.key === 'status') return 'status';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isCsvImportStagingColumnSortable(
  columns: readonly CsvImportStagingGridColumn[],
  key: string,
): key is CsvImportStagingGridColumnKey {
  return columns.some((c) => c.key === key && csvImportStagingSortFactFor(c) !== null);
}

/** CSS grid template — one `var(--cf-col-<key>, <width>)` track per column. */
export function csvImportStagingGridTemplate(
  columns: readonly CsvImportStagingGridColumn[] = CSV_IMPORT_STAGING_SHEET_COLUMNS,
): string {
  return gridTemplate(columns);
}

/** Sticky offset for a frozen cell, derived from the MOUNTED model. */
export function csvImportStagingGridFrozenLeft(
  columns: readonly CsvImportStagingGridColumn[],
  key: CsvImportStagingGridColumnKey,
): string {
  return gridFrozenLeft(columns, key);
}

/**
 * First-activation direction. Everything here is a label or an id read one row
 * at a time, so ascending is the honest default; quantity is the one magnitude
 * and an operator sorting it is looking for the big ones first.
 */
export function defaultDirForCsvImportStagingColumn(
  columns: readonly CsvImportStagingGridColumn[],
  key: string,
): GridSortDir {
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'number' ? 'desc' : 'asc';
}

// Shared spreadsheet chrome — @/design-system/components/grid ledgerGridCell.
export {
  LEDGER_GRID_FROZEN_CELL as CSV_IMPORT_STAGING_GRID_FROZEN_CELL,
  ledgerGridCell as csvImportStagingGridCell,
  ledgerGridRowShellClass as csvImportStagingGridRowShellClass,
} from '@/design-system/components/grid/grid-cell-chrome';
