/**
 * SKU-velocity column model — MATERIALIZED from a {@link SlotLayout} onto the
 * SHARED compound skeleton, never a hand array.
 *
 * It replaced `VELOCITY_COLUMNS`, a page-local `AdminTableColumn[]` literal
 * carrying six JSX cells (two of them hue-coded) over
 * `Record<string, unknown>` rows: a second table engine's column type, with no
 * header sort, no Fields picker and no org binding, because that engine never
 * grew them.
 *
 * The skeleton mounts WHOLE — no `.filter`. A velocity row has no photo, so
 * the gutter paints the typed placeholder exactly as `cycle-counts`,
 * `part-compatibility` and `kiosk-slot-events` already do; filtering `thumb`
 * off the mount would need a new `COMPOUND_SKELETON_FILTER_DEBT` row and that
 * list is documented shrink-only. Chrome headers are family DATA and are
 * relabelled (SKU · Product · Last move · Tier); geometry is the engine's.
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  REPORT_VELOCITY_FIELD_CATALOG,
  REPORT_VELOCITY_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/report-velocity';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
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

export interface ReportVelocityGridColumn
  extends Omit<LedgerGridColumnModel, 'key'>,
    SlotTrackFields {
  key: ReportVelocityGridColumnKey;
  sortable?: boolean;
}

/** Materialize the mounted columns from an effective layout. */
export function reportVelocityCompoundColumnsFor(
  layout: SlotLayout,
): readonly ReportVelocityGridColumn[] {
  const tracks = materializeTracks<ReportVelocityGridColumn>({
    layout,
    catalog: REPORT_VELOCITY_FIELD_CATALOG,
    base: compoundColumnsFor<ReportVelocityGridColumn>(),
  });
  // The identity slot IS the shared `fulfillment` chrome track. Its WORD is
  // the engine's `Id` on every peer (`slot-table-family.ts`); this
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
  });
}

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const REPORT_VELOCITY_COMPOUND_COLUMNS: readonly ReportVelocityGridColumn[] =
  reportVelocityCompoundColumnsFor(REPORT_VELOCITY_PRODUCT_LAYOUT);

/**
 * The FACT a column sorts by, or null when it offers no sort.
 *
 * Every painted DATA track answers, including the four the chrome paints: a
 * labeled header with a dead click fails `SLOT_TABLE_PAINT_LAW.headerSort`.
 * Structural chrome is named by `isSlotTableChromeTrack`, never by a hand list
 * that could drift from the law.
 */
export function reportVelocitySortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (col.sortable === false) return null;
  if (isSlotTableChromeTrack(col.key)) return null;
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
