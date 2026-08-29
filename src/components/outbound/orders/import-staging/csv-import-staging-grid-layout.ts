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

import { gridFrozenKeys } from '@/design-system/components/grid/grid-column-editability';
import {
  gridFrozenLeft,
  gridTemplate,
} from '@/design-system/components/grid/grid-column-geometry';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type CsvImportStagingGridColumnKey =
  | 'select'
  | 'order'
  | 'status'
  | 'sku'
  | 'qty'
  | 'customer'
  | 'tracking'
  | 'platform';

export interface CsvImportStagingGridColumn {
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
 * Canonical staging columns. `customer` is the single flex track — it absorbs
 * the sheet's slack, so the fixed identity / magnitude tracks stay still while
 * a long buyer name truncates.
 */
export const CSV_IMPORT_STAGING_GRID_COLUMNS: readonly CsvImportStagingGridColumn[] = [
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
  // Triage state — structural (no hideKey), the whole point of this surface.
  {
    key: 'status',
    width: 'minmax(9rem, 9rem)',
    label: 'Status',
    type: 'tag',
    labelFitRem: 4.5,
  },
  {
    key: 'sku',
    width: 'minmax(8rem, 8rem)',
    label: 'SKU',
    type: 'id',
    hideKey: 'sku',
    labelFitRem: 3.5,
  },
  {
    key: 'qty',
    width: 'minmax(4.5rem, 4.5rem)',
    label: 'Quantity',
    gridLabel: 'Qty',
    type: 'number',
    hideKey: 'qty',
    labelFitRem: 3,
  },
  {
    key: 'customer',
    width: 'minmax(10rem, 1fr)',
    label: 'Customer',
    type: 'text',
    hideKey: 'customer',
    minTrackRem: 10,
    labelFitRem: 6,
  },
  {
    key: 'tracking',
    width: 'minmax(8rem, 8rem)',
    label: 'Tracking',
    type: 'tracking',
    hideKey: 'tracking',
    labelFitRem: 5,
  },
  {
    key: 'platform',
    width: 'minmax(7rem, 7rem)',
    label: 'Platform',
    type: 'text',
    hideKey: 'platform',
    labelFitRem: 5,
  },
] as const;

/** Frozen identity pane — `select · order`, derived from the model's own flag. */
const CSV_IMPORT_STAGING_LOCKED_KEYS: readonly CsvImportStagingGridColumnKey[] = gridFrozenKeys(
  CSV_IMPORT_STAGING_GRID_COLUMNS,
);

const CSV_IMPORT_STAGING_SORTABLE_KEYS: readonly CsvImportStagingGridColumnKey[] =
  CSV_IMPORT_STAGING_GRID_COLUMNS.filter(
    (c) => c.sortable !== false && c.key !== 'select',
  ).map((c) => c.key);

export function isCsvImportStagingGridSortable(
  key: string,
): key is CsvImportStagingGridColumnKey {
  return (CSV_IMPORT_STAGING_SORTABLE_KEYS as readonly string[]).includes(key);
}

export function isCsvImportStagingGridFrozen(key: string): boolean {
  return CSV_IMPORT_STAGING_LOCKED_KEYS.includes(key as CsvImportStagingGridColumnKey);
}

/** CSS grid template — one `var(--cf-col-<key>, <width>)` track per column. */
export function csvImportStagingGridTemplate(
  columns: readonly CsvImportStagingGridColumn[] = CSV_IMPORT_STAGING_GRID_COLUMNS,
): string {
  return gridTemplate(columns);
}

/** Sticky offset for a frozen cell — row px + the widths of the locked columns before it. */
export function csvImportStagingGridFrozenLeft(key: CsvImportStagingGridColumnKey): string {
  return gridFrozenLeft(CSV_IMPORT_STAGING_GRID_COLUMNS, key);
}

/**
 * First-activation direction. Everything here is a label or an id read one row
 * at a time, so ascending is the honest default; `qty` is the one magnitude and
 * an operator sorting it is looking for the big ones first.
 */
export function defaultDirForCsvImportStagingGridSort(
  key: CsvImportStagingGridColumnKey,
): GridSortDir {
  return key === 'qty' ? 'desc' : 'asc';
}

// Shared spreadsheet chrome — @/design-system/components/grid ledgerGridCell.
export {
  LEDGER_GRID_FROZEN_CELL as CSV_IMPORT_STAGING_GRID_FROZEN_CELL,
  ledgerGridCell as csvImportStagingGridCell,
  ledgerGridRowShellClass as csvImportStagingGridRowShellClass,
} from '@/design-system/components/grid/grid-cell-chrome';
