/**
 * Bin-utilization column model — MATERIALIZED from a {@link SlotLayout} onto
 * the SHARED compound skeleton, never a hand array.
 *
 * It replaced `UTILIZATION_COLUMNS`, a page-local `AdminTableColumn[]` literal
 * carrying six JSX cells over `Record<string, unknown>` rows: a second table
 * engine's column type, with no header sort, no Fields picker and no org
 * binding, because that engine never grew them.
 *
 * The skeleton mounts WHOLE — no `.filter`. A bin has no photo, so the gutter
 * paints the typed placeholder exactly as `cycle-counts`, `part-compatibility`
 * and `kiosk-slot-events` already do. Chrome headers are family DATA and are
 * relabelled (Bin · Room · Fill); geometry is the engine's.
 *
 * ## The `dates` track carries no fact, and says so
 *
 * This is the one ruling in the family worth reading twice.
 *
 * `mv_bin_utilization` has no timestamp in the route's `SELECT`
 * (`bin_id, bin_name, barcode, room, row_label, col_label, capacity, in_bin,
 * fill_ratio, sku_count`), and changing that route is a stated non-goal. Every
 * other compound family maps its one stamp into this track for the reason
 * `part-compatibility` states plainly — "the skeleton mounts whole, so the
 * Dates track paints whether or not the family has a stamp". Here there is
 * nothing to map, so the two rules that normally agree pull apart:
 *
 * - cutting the track needs a new `COMPOUND_SKELETON_FILTER_DEBT` row, and
 *   that list is documented shrink-only ("do not grow this list to paint fewer
 *   columns");
 * - leaving it labelled `Dates` with a live header would be a click-to-sort
 *   promise over a column of `--`, which is what
 *   `SLOT_TABLE_PAINT_LAW.headerSort` exists to stop.
 *
 * So the track mounts and is declared INERT CHROME in the engine's own
 * vocabulary: `gridLabel: ''` (the instruction `select` and `_fill` already
 * use — *print nothing here*, as distinct from `undefined`) plus
 * `sortable: false`, which is what {@link reportBinUtilizationSortFactFor}
 * reads to answer `null`. The paint law's exempt set is exactly the tracks
 * that carry no ops fact (`select`, `actions`, `_fill`, `thumb`); a mandatory
 * date track on a timeless row is that same category, and naming it here — in
 * one place, asserted by `report-bin-utilization.test.ts` — keeps it a
 * decision rather than a dead header nobody noticed.
 *
 * If the report ever selects a refresh or count stamp, this becomes an
 * ordinary catalog fact and the two overrides come straight back off.
 */

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
    // The pill carries the DERIVED fill percentage. `slotDisplayType` is set
    // WITHOUT a `fieldId` on purpose: the engine types the sort comparator
    // from it (so 100 beats 88 instead of losing to it lexically) and reads
    // `fieldId` to decide which tracks get a resolved slot value — and the
    // state cell paints `view.stateLabel`, never a slot.
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

/**
 * The FACT a column sorts by, or null when it offers no sort.
 *
 * Every painted DATA track answers except the declared-inert `dates` chrome,
 * which returns on the `sortable === false` line above the rest. Structural
 * chrome is named by `isSlotTableChromeTrack`, never by a hand list that could
 * drift from the law.
 */
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
