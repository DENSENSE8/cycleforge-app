/** Dead-stock column model — MATERIALIZED from a {@link DataTableColumnLayout} onto the SHARED compound skeleton, never a hand array. */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  REPORT_DEAD_STOCK_FIELD_CATALOG,
  REPORT_DEAD_STOCK_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/report-dead-stock';
import { materializeTracks, type DataTableColumnFields } from '@/lib/tables/materialize-tracks';
import { isDataTableChromeColumn } from '@/lib/tables/data-table-header-sort';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type ReportDeadStockGridColumnKey =
  /** Shared compound chrome tracks — see `COMPOUND_COLUMN_KEYS`. */
  | 'select'
  | 'fulfillment'
  | 'thumb'
  | 'item'
  | 'dates'
  | 'state'
  | '_fill'
  /** Materialized slot tracks — keys are slot indices, never field ids. */
  | `status:${number}`
  | `subtitle:${number}`;

export interface ReportDeadStockGridColumn extends Omit<LedgerGridColumnModel, 'key'>, DataTableColumnFields { key: ReportDeadStockGridColumnKey;
sortable?: boolean; }

/** Materialize the mounted columns from an effective layout. */
export function reportDeadStockCompoundColumnsFor(layout: DataTableColumnLayout): readonly ReportDeadStockGridColumn[] { const tracks = materializeTracks<ReportDeadStockGridColumn>({
  layout,
  catalog: REPORT_DEAD_STOCK_FIELD_CATALOG,
  base: compoundColumnsFor<ReportDeadStockGridColumn>(),
});
// The identity slot IS the shared `fulfillment` chrome track. Its WORD is
// the engine's `Id` on every peer (`data-table-family.ts`); this
// family supplies only the FACT the chip paints and its header sorts by.
const identity = REPORT_DEAD_STOCK_FIELD_CATALOG.find((f) => f.id === layout.identityFieldId);
return tracks.map((t) => {
  if (t.key === 'fulfillment' && identity) {
    return {
      ...t,
      type: 'id' as const,
      fieldId: identity.id,
      slotDisplayType: identity.displayType,
    };
  }
  // The title line is the PRODUCT that is sitting still.
  if (t.key === 'item') return { ...t, label: 'Product', gridLabel: 'Product' };
  // One temporal fact on this report: the instant the dormancy counts from.
  if (t.key === 'dates') return { ...t, label: 'Last move', gridLabel: 'Last move' };
  // The pill carries the DORMANCY COUNT.
  if (t.key === 'state') {
    return {
      ...t,
      label: 'Dormant',
      gridLabel: 'Dormant',
      slotDisplayType: 'number' as const,
    };
  }
  return t;
}); }

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const REPORT_DEAD_STOCK_COMPOUND_COLUMNS: readonly ReportDeadStockGridColumn[] =
  reportDeadStockCompoundColumnsFor(REPORT_DEAD_STOCK_PRODUCT_LAYOUT);

/** The FACT a column sorts by, or null when it offers no sort. */
export function reportDeadStockSortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (col.sortable === false) return null;
  if (isDataTableChromeColumn(col.key)) return null;
  if (col.key === 'fulfillment') return 'report-dead-stock.sku';
  if (col.key === 'item') return 'report-dead-stock.product';
  if (col.key === 'state') return 'report-dead-stock.days_dormant';
  // The Dates chrome paints the last-move stamp on its Hash line, so its
  // header sorts that same fact.
  if (col.key === 'dates') return 'report-dead-stock.last_move';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isReportDeadStockColumnSortable(
  columns: readonly ReportDeadStockGridColumn[],
  key: string,
): key is ReportDeadStockGridColumnKey {
  return columns.some((c) => c.key === key && reportDeadStockSortFactFor(c) !== null);
}

/** Dates and counts read newest/highest first; names and ids alphabetically. */
export function defaultDirForReportDeadStockColumn(
  columns: readonly ReportDeadStockGridColumn[],
  key: string,
): GridSortDir {
  // The chrome date track carries no bound field, so it has no slotDisplayType.
  if (key === 'dates') return 'desc';
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}
