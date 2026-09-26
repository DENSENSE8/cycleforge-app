/**
 * Packer-day column model — MATERIALIZED from a {@link SlotLayout} onto the
 * shared compound skeleton, exactly as its three report siblings are.
 *
 * No column literal is written here: `materializeTracks` resolves the layout
 * against the skeleton's chrome tracks, so a Fields-menu change re-materializes
 * through the same path and can never fork from the guard.
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import {
  REPORT_PACKER_DAY_FIELD_CATALOG,
  REPORT_PACKER_DAY_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/report-packer-day';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type ReportPackerDayGridColumnKey =
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

export interface ReportPackerDayGridColumn
  extends Omit<LedgerGridColumnModel, 'key'>,
    SlotTrackFields {
  key: ReportPackerDayGridColumnKey;
}

/** Materialize the mounted columns from an effective layout. */
export function reportPackerDayCompoundColumnsFor(
  layout: SlotLayout,
): readonly ReportPackerDayGridColumn[] {
  const tracks = materializeTracks<ReportPackerDayGridColumn>({
    layout,
    catalog: REPORT_PACKER_DAY_FIELD_CATALOG,
    base: compoundColumnsFor<ReportPackerDayGridColumn>(),
  });
  // The identity slot IS the shared `fulfillment` chrome track. Its WORD is
  // the engine's `Id` on every peer (`slot-table-family.ts`); this
  // family supplies only the FACT the chip paints and its header sorts by.
  const identity = REPORT_PACKER_DAY_FIELD_CATALOG.find((f) => f.id === layout.identityFieldId);
  return tracks.map((t) => {
    if (t.key === 'fulfillment' && identity) {
      return {
        ...t,
        type: 'id' as const,
        fieldId: identity.id,
        slotDisplayType: identity.displayType,
      };
    }
    if (t.key === 'item') return { ...t, label: 'Product', gridLabel: 'Product' };
    // The one temporal fact: when the pack scan landed. Every row on one
    // report shares a civil day, so the day adds nothing and the time is the
    // fact a lead reads down the column.
    if (t.key === 'dates') return { ...t, label: 'Packed at', gridLabel: 'Packed at' };
    if (t.key === 'state') {
      /*
       * `slotDisplayType: 'text'` with NO `fieldId`, the same trick the
       * staff-day pill pulls with `date`: the engine types the sort comparator
       * from it while the cell paints `view.stateLabel` — the WORD — never a
       * resolved slot. Sorting this column groups every pack that carries a
       * guessed standard, which is the pairing work queue.
       */
      return {
        ...t,
        label: 'Basis',
        gridLabel: 'Basis',
        slotDisplayType: 'text' as const,
      };
    }
    return t;
  });
}

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const REPORT_PACKER_DAY_COMPOUND_COLUMNS: readonly ReportPackerDayGridColumn[] =
  reportPackerDayCompoundColumnsFor(REPORT_PACKER_DAY_PRODUCT_LAYOUT);

/**
 * The FACT a column sorts by, or null when it offers no sort. Mirrors the
 * sibling reports: chrome tracks sort by their adapter fact, slot tracks by
 * their bound field id.
 */
export function reportPackerDaySortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (!col.sortable) return null;
  if (col.key === 'item') return 'report-packer-day.product';
  // The Id chrome sorts by the ORDER NUMBER it paints, not by the tracking on
  // its second line and not by the packer — the header and the comparator must
  // name the same fact.
  if (col.key === 'fulfillment') return 'report-packer-day.order_number';
  if (col.key === 'state') return 'report-packer-day.basis';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isReportPackerDayColumnSortable(
  columns: readonly ReportPackerDayGridColumn[],
  key: string,
): key is ReportPackerDayGridColumnKey {
  return columns.some((c) => c.key === key && reportPackerDaySortFactFor(c) !== null);
}

/** Times read newest first; names, products and SKUs alphabetically. */
export function defaultDirForReportPackerDayColumn(
  columns: readonly ReportPackerDayGridColumn[],
  key: string,
): GridSortDir {
  return key === 'dates' ? 'desc' : 'asc';
}
