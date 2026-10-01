/** Catalog spreadsheet column model — MATERIALIZED from a {@link DataTableColumnLayout}, never a hand array. */

import {
  gridFrozenLeft,
  gridTemplate,
} from '@/design-system/components/grid/grid-column-geometry';
import type { CatalogListRow } from '@/components/products/catalog/types';
import {
  CATALOG_FIELD_CATALOG,
  CATALOG_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/catalog';
import { materializeTracks, type DataTableColumnFields } from '@/lib/tables/materialize-tracks';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type CatalogGridColumnKey =
  | 'select'
  | 'title'
  /** Materialized slot tracks — keys are slot indices, never field ids. */
  | `status:${number}`
  | `subtitle:${number}`;

export interface CatalogGridColumn extends DataTableColumnFields { key: CatalogGridColumnKey;
width: string;
label?: string;
gridLabel?: string;
labelFitRem?: number;
type?: ColumnType;
/** Justification override — see {@link LedgerGridColumnModel.align}. */
align?: 'start' | 'end';
/** Part of the frozen identity pane — see {@link LedgerGridColumnModel.frozen}. */
frozen?: boolean;
/** Staff-preference key (`staff_preferences.tableColumns.catalog`). */
hideKey?: string;
/** `core` ships ON (opt-out); `optional` ships OFF (opt-in via Fields). */
tier?: 'core' | 'optional';
/** When false, the header is not click-to-sort (select gutter only). */
sortable?: boolean; }

/**
 * The structural sheet skeleton — what Catalog paints with ZERO bindings.
 * `title` is the only flex track; the frozen pane is `select · title`.
 */
const CATALOG_SHEET_BASE: readonly CatalogGridColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', sortable: false, frozen: true },
  {
    key: 'title',
    frozen: true,
    width: 'minmax(14rem, 1fr)',
    label: 'Product',
    gridLabel: 'Product',
    type: 'text',
    labelFitRem: 8,
  },
];

/**
 * Materialize the mounted catalog columns from an effective layout. Both bands
 * anchor on `title`, so the default plate reads sku · inventory · status —
 * the retired hand model's core view.
 */
export function catalogSheetColumnsFor(layout: DataTableColumnLayout): readonly CatalogGridColumn[] { return materializeTracks<CatalogGridColumn>({
  layout,
  catalog: CATALOG_FIELD_CATALOG,
  base: CATALOG_SHEET_BASE,
  statusAnchorKey: 'title',
  subtitleAnchorKey: 'title',
}); }

/**
 * The PRODUCT-DEFAULT materialization — what an org with no override mounts,
 * the canonical columns of the catalog binding, and the guard SoT.
 */
export const CATALOG_SHEET_COLUMNS: readonly CatalogGridColumn[] =
  catalogSheetColumnsFor(CATALOG_PRODUCT_LAYOUT);

/** The FACT a column sorts by, or null when it offers no sort. */
export function catalogSortFactFor(col: CatalogGridColumn): string | null {
  if (col.sortable === false || col.key === 'select') return null;
  if (col.key === 'title') return 'title';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isCatalogColumnSortable(
  columns: readonly CatalogGridColumn[],
  key: string,
): key is CatalogGridColumnKey {
  return columns.some((c) => c.key === key && catalogSortFactFor(c) !== null);
}

function catalogGridTemplate(
  columns: readonly CatalogGridColumn[] = CATALOG_SHEET_COLUMNS,
): string {
  return gridTemplate(columns);
}

/**
 * Default direction on first activation: magnitudes and dates read
 * newest/biggest first, names and ids alphabetically.
 */
export function defaultDirForCatalogColumn(
  columns: readonly CatalogGridColumn[],
  key: string,
): GridSortDir {
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}

/** Sticky-left offset for a frozen cell, derived from the MOUNTED model. */
function catalogGridFrozenLeft(
  columns: readonly CatalogGridColumn[],
  key: string,
): string {
  return gridFrozenLeft(columns, key);
}

function catalogDisplayTitle(row: CatalogListRow): string {
  return (row.display_title || row.product_title || row.sku || '').trim();
}

/** Row order for a column sort, keyed by SORT FACT — the structural `title` plus catalog field ids (`catalogSortFactFor` maps a mounted… */
function compareCatalogGridRows(
  a: CatalogListRow,
  b: CatalogListRow,
  fact: string,
  dir: GridSortDir,
): number {
  const mul = dir === 'desc' ? -1 : 1;
  const cmpStr = (x: string, y: string) => x.localeCompare(y, undefined, { sensitivity: 'base' }) * mul;
  const cmpNum = (x: number, y: number) => (x - y) * mul;

  switch (fact) {
    case 'title':
      return cmpStr(catalogDisplayTitle(a), catalogDisplayTitle(b));
    case 'catalog.sku':
      return cmpStr(a.sku || '', b.sku || '');
    case 'catalog.inventory':
      return cmpStr(a.provider_item_id || '', b.provider_item_id || '');
    case 'catalog.channels':
      return cmpNum(a.platform_count, b.platform_count);
    case 'catalog.manuals':
      return cmpNum(a.manual_count, b.manual_count);
    case 'catalog.qc':
      return cmpNum(a.qc_step_count, b.qc_step_count);
    case 'catalog.orders':
      return cmpNum(a.order_count, b.order_count);
    case 'catalog.status': {
      const rank = (r: CatalogListRow) =>
        (r.has_pending_action ? 2 : 0) + (r.is_active ? 0 : 1) + (r.is_inventory_linked ? 0 : 0.5);
      return cmpNum(rank(a), rank(b));
    }
    case 'catalog.cost':
      return cmpNum(a.last_known_cost_cents ?? 0, b.last_known_cost_cents ?? 0);
    case 'catalog.category':
      return cmpStr(a.category || '', b.category || '');
    default:
      return cmpStr(catalogDisplayTitle(a), catalogDisplayTitle(b));
  }
}

// Shared spreadsheet chrome — @/design-system/components/grid ledgerGridCell.
export {
  LEDGER_GRID_FROZEN_CELL as CATALOG_GRID_FROZEN_CELL,
  ledgerGridCell as catalogGridCell,
  ledgerGridRowShellClass as catalogGridRowShellClass,
} from '@/design-system/components/grid/grid-cell-chrome';
