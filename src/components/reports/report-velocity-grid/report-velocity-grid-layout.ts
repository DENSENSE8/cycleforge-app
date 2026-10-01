/** SKU-velocity column model — MATERIALIZED from a {@link DataTableColumnLayout} onto the SHARED compound skeleton, never a hand array. */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  REPORT_VELOCITY_FIELD_CATALOG,
  REPORT_VELOCITY_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/report-velocity';
import { materializeTracks, type DataTableColumnFields } from '@/lib/tables/materialize-tracks';
import { isDataTableChromeColumn } from '@/lib/tables/data-table-header-sort';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type ReportVelocityGridColumnKey =
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

export interface ReportVelocityGridColumn extends Omit<LedgerGridColumnModel, 'key'>, DataTableColumnFields { key: ReportVelocityGridColumnKey;
sortable?: boolean; }

/** Materialize the mounted columns from an effective layout. */
export function reportVelocityCompoundColumnsFor(layout: DataTableColumnLayout): readonly ReportVelocityGridColumn[] { const tracks = materializeTracks<ReportVelocityGridColumn>({
  layout,
  catalog: REPORT_VELOCITY_FIELD_CATALOG,
  base: compoundColumnsFor<ReportVelocityGridColumn>(),
});
// The identity slot IS the shared `fulfillment` chrome track. Its WORD is
// the engine's `Id` on every peer (`data-table-family.ts`); this
// family supplies only the FACT the chip paints and its header sorts by.
const identity = REPORT_VELOCITY_FIELD_CATALOG.find((f) => f.id === layout.identityFieldId);
return tracks.map((t) => {
  if (t.key === 'fulfillment' && identity) {
    return {
      ...t,
      type: 'id' as const,
      fieldId: identity.id,
      slotDisplayType: identity.displayType,
    };
  }
  // The title line is the PRODUCT this SKU sells.
  if (t.key === 'item') return { ...t, label: 'Product', gridLabel: 'Product' };
  // One temporal fact on this report: when the SKU last moved.
  if (t.key === 'dates') return { ...t, label: 'Last move', gridLabel: 'Last move' };
  // The pill the retired `tier` cell painted, in the pill's own track. No
  // `slotDisplayType`: a tier is a letter, and the engine's default text
  // collation already orders A before D.
  if (t.key === 'state') return { ...t, label: 'Tier', gridLabel: 'Tier' };
  return t;
}); }

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const REPORT_VELOCITY_COMPOUND_COLUMNS: readonly ReportVelocityGridColumn[] =
  reportVelocityCompoundColumnsFor(REPORT_VELOCITY_PRODUCT_LAYOUT);

/** The FACT a column sorts by, or null when it offers no sort. */
export function reportVelocitySortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (col.sortable === false) return null;
  if (isDataTableChromeColumn(col.key)) return null;
  if (col.key === 'fulfillment') return 'report-velocity.sku';
  if (col.key === 'item') return 'report-velocity.product';
  if (col.key === 'state') return 'report-velocity.tier';
  // The Dates chrome paints the last-move stamp on its Hash line, so its
  // header sorts that same fact.
  if (col.key === 'dates') return 'report-velocity.last_move';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isReportVelocityColumnSortable(
  columns: readonly ReportVelocityGridColumn[],
  key: string,
): key is ReportVelocityGridColumnKey {
  return columns.some((c) => c.key === key && reportVelocitySortFactFor(c) !== null);
}

/** Dates and counts read newest/highest first; names and ids alphabetically. */
export function defaultDirForReportVelocityColumn(
  columns: readonly ReportVelocityGridColumn[],
  key: string,
): GridSortDir {
  // The chrome date track carries no bound field, so it has no slotDisplayType.
  if (key === 'dates') return 'desc';
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}
