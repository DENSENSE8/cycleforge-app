/** Bin-utilization column model — MATERIALIZED from a {@link SlotLayout} onto the SHARED compound skeleton, never a hand array. */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  REPORT_BIN_UTILIZATION_FIELD_CATALOG,
  REPORT_BIN_UTILIZATION_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/report-bin-utilization';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type ReportBinUtilizationGridColumnKey =
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

export interface ReportBinUtilizationGridColumn
  extends Omit<LedgerGridColumnModel, 'key'>,
    SlotTrackFields {
  key: ReportBinUtilizationGridColumnKey;
  /** Header click-to-sort. Declared `false` only on factless chrome. */
  sortable?: boolean;
}

/** Materialize the mounted columns from an effective layout. */
export function reportBinUtilizationCompoundColumnsFor(
  layout: SlotLayout,
): readonly ReportBinUtilizationGridColumn[] {
  const tracks = materializeTracks<ReportBinUtilizationGridColumn>({
    layout,
    catalog: REPORT_BIN_UTILIZATION_FIELD_CATALOG,
    base: compoundColumnsFor<ReportBinUtilizationGridColumn>(),
  });
  // The identity slot IS the shared `fulfillment` chrome track. Its WORD is
  // the engine's `Id` on every peer (`slot-table-family.ts`); this
  // family supplies only the FACT the chip paints and its header sorts by.
  const identity = REPORT_BIN_UTILIZATION_FIELD_CATALOG.find(
    (f) => f.id === layout.identityFieldId,
  );
  return tracks.map((t) => {
    if (t.key === 'fulfillment' && identity) {
      return {
        ...t,
        type: 'id' as const,
        fieldId: identity.id,
        slotDisplayType: identity.displayType,
      };
    }
    // The title line is WHERE the bin is — a bin row's answer to "what is it".
    if (t.key === 'item') return { ...t, label: 'Room', gridLabel: 'Room' };
    // Factless chrome — see the docblock. `gridLabel: ''` prints no header and
    // `sortable: false` is what the sort-fact function reads.
    if (t.key === 'dates') return { ...t, gridLabel: '', sortable: false };
    // The pill carries the DERIVED fill percentage.
    if (t.key === 'state') {
      return {
        ...t,
        label: 'Fill',
        gridLabel: 'Fill',
        slotDisplayType: 'number' as const,
      };
    }
    return t;
  });
}

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const REPORT_BIN_UTILIZATION_COMPOUND_COLUMNS: readonly ReportBinUtilizationGridColumn[] =
  reportBinUtilizationCompoundColumnsFor(REPORT_BIN_UTILIZATION_PRODUCT_LAYOUT);

/** The FACT a column sorts by, or null when it offers no sort. */
export function reportBinUtilizationSortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (col.sortable === false) return null;
  if (isSlotTableChromeTrack(col.key)) return null;
  if (col.key === 'fulfillment') return 'report-bin-utilization.bin';
  if (col.key === 'item') return 'report-bin-utilization.room';
  if (col.key === 'state') return 'report-bin-utilization.fill';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isReportBinUtilizationColumnSortable(
  columns: readonly ReportBinUtilizationGridColumn[],
  key: string,
): key is ReportBinUtilizationGridColumnKey {
  return columns.some(
    (c) => c.key === key && reportBinUtilizationSortFactFor(c) !== null,
  );
}

/** Counts read highest-first; names and ids alphabetically. */
export function defaultDirForReportBinUtilizationColumn(
  columns: readonly ReportBinUtilizationGridColumn[],
  key: string,
): GridSortDir {
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}
