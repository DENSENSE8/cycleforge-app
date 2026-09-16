/**
 * Staff-day column model — MATERIALIZED from a {@link SlotLayout} onto the
 * shared compound skeleton, exactly as its two report siblings are.
 *
 * No column literal is written here: `materializeTracks` resolves the layout
 * against the skeleton's chrome tracks, so a Fields-menu change re-materializes
 * through the same path and can never fork from the guard below.
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import {
  REPORT_STAFF_DAY_FIELD_CATALOG,
  REPORT_STAFF_DAY_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/report-staff-day';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type ReportStaffDayGridColumnKey =
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

export interface ReportStaffDayGridColumn
  extends Omit<LedgerGridColumnModel, 'key'>,
    SlotTrackFields {
  key: ReportStaffDayGridColumnKey;
}

/** Materialize the mounted columns from an effective layout. */
export function reportStaffDayCompoundColumnsFor(
  layout: SlotLayout,
): readonly ReportStaffDayGridColumn[] {
  const tracks = materializeTracks<ReportStaffDayGridColumn>({
    layout,
    catalog: REPORT_STAFF_DAY_FIELD_CATALOG,
    base: compoundColumnsFor<ReportStaffDayGridColumn>(),
  });
  // The identity slot IS the shared `fulfillment` chrome track. Its WORD is
  // the engine's `Id` on every peer (`slot-table-id-header-law.ts`); this
  // family supplies only the FACT the chip paints and its header sorts by.
  const identity = REPORT_STAFF_DAY_FIELD_CATALOG.find((f) => f.id === layout.identityFieldId);
  return tracks.map((t) => {
    if (t.key === 'fulfillment' && identity) {
      return {
        ...t,
        type: 'id' as const,
        fieldId: identity.id,
        slotDisplayType: identity.displayType,
      };
    }
    if (t.key === 'item') return { ...t, label: 'Task', gridLabel: 'Task' };
    // The one temporal fact: the instant the check happened — the sentence the
    // whole report exists to answer.
    if (t.key === 'dates') return { ...t, label: 'Checked at', gridLabel: 'Checked at' };
    if (t.key === 'state') {
      // `slotDisplayType: 'date'` with NO `fieldId`, the same trick the
      // dead-stock state pill pulls with `number`: the engine types the sort
      // comparator from it (an instant sorts chronologically, not lexically)
      // while the cell itself paints `view.stateLabel` — the WORD — never a
      // resolved slot.
      return {
        ...t,
        label: 'Checked',
        gridLabel: 'Checked',
        slotDisplayType: 'date' as const,
      };
    }
    return t;
  });
}

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const REPORT_STAFF_DAY_COMPOUND_COLUMNS: readonly ReportStaffDayGridColumn[] =
  reportStaffDayCompoundColumnsFor(REPORT_STAFF_DAY_PRODUCT_LAYOUT);

/**
 * The FACT a column sorts by, or null when it offers no sort. Mirrors the
 * sibling reports: chrome tracks sort by their adapter fact, slot tracks by
 * their bound field id.
 */
export function reportStaffDaySortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (!col.sortable) return null;
  if (col.key === 'item') return 'report-staff-day.task';
  if (col.key === 'fulfillment') return 'report-staff-day.staff';
  if (col.key === 'dates') return 'report-staff-day.checked_at';
  if (col.key === 'state') return 'report-staff-day.checked_at';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isReportStaffDayColumnSortable(
  columns: readonly ReportStaffDayGridColumn[],
  key: string,
): key is ReportStaffDayGridColumnKey {
  return columns.some((c) => c.key === key && reportStaffDaySortFactFor(c) !== null);
}

/** Dates read newest first; names and tasks alphabetically. */
export function defaultDirForReportStaffDayColumn(
  columns: readonly ReportStaffDayGridColumn[],
  key: string,
): GridSortDir {
  return key === 'dates' || key === 'state' ? 'desc' : 'asc';
}
