/** Local Pickup sheet column model — MATERIALIZED from a {@link DataTableColumnLayout}, never a hand array. */

import { PICKUP_FIELD_CATALOG, PICKUP_PRODUCT_LAYOUT } from '@/lib/tables/field-catalog/pickup';
import { materializeTracks, type DataTableColumnFields } from '@/lib/tables/materialize-tracks';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type PickupGridColumnKey =
  | 'select'
  | 'title'
  /** The LCPU PO# — structural identity track; `pickup.order` resolves it. */
  | 'order'
  /** Materialized slot tracks — keys are slot indices, never field ids. */
  | `status:${number}`
  | `subtitle:${number}`;

export interface PickupGridColumn extends DataTableColumnFields { key: PickupGridColumnKey;
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
/** When false, header is not click-to-sort (select gutter only). Default true. */
sortable?: boolean; }

/**
 * The structural sheet skeleton — what pickup paints with ZERO bindings.
 * `title` is the only flex track; the frozen pane is `select · title`; Order
 * rides unfrozen beside it as the fold key. Slot bands insert after `order`.
 */
const PICKUP_SHEET_BASE: readonly PickupGridColumn[] = [
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
  {
    key: 'order',
    width: 'minmax(9rem, 9rem)',
    label: 'Order',
    gridLabel: 'Order',
    type: 'id',
    labelFitRem: 4.5,
  },
];

/** Materialize the mounted pickup columns from an effective layout. */
export function pickupSheetColumnsFor(layout: DataTableColumnLayout): readonly PickupGridColumn[] { return materializeTracks<PickupGridColumn>({
  layout,
  catalog: PICKUP_FIELD_CATALOG,
  base: PICKUP_SHEET_BASE,
  statusAnchorKey: 'order',
  subtitleAnchorKey: 'order',
}); }

/**
 * The PRODUCT-DEFAULT materialization — what an org with no override mounts
 * (`select · title · order · date · status`, the retired hand model's core
 * view), the canonical columns of the pickup binding, and the guard SoT.
 */
export const PICKUP_SHEET_COLUMNS: readonly PickupGridColumn[] =
  pickupSheetColumnsFor(PICKUP_PRODUCT_LAYOUT);

/** The FACT a column sorts by, or null when it offers no sort: */
export function pickupSortFactFor(col: PickupGridColumn): string | null {
  if (col.sortable === false || col.key === 'select') return null;
  if (col.key === 'title') return 'title';
  if (col.key === 'order') return 'order';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isPickupColumnSortable(
  columns: readonly PickupGridColumn[],
  key: string,
): key is PickupGridColumnKey {
  return columns.some((c) => c.key === key && pickupSortFactFor(c) !== null);
}

/**
 * Default direction when first activating a column sort: magnitudes and dates
 * read newest/biggest first (`date` / `money` / `number` display types), names
 * and ids alphabetically.
 */
export function defaultDirForPickupColumn(
  columns: readonly PickupGridColumn[],
  key: string,
): GridSortDir {
  const col = columns.find((c) => c.key === key);
  const dt = col?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}

// Shared spreadsheet chrome — @/design-system/components/grid ledgerGridCell.
export {
  LEDGER_GRID_FROZEN_CELL as PICKUP_GRID_FROZEN_CELL,
  ledgerGridCell as pickupGridCell,
  ledgerGridRowShellClass as pickupGridRowShellClass,
} from '@/design-system/components/grid/grid-cell-chrome';
