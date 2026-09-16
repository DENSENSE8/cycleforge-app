/**
 * Dead-stock column model — MATERIALIZED from a {@link SlotLayout} onto the
 * SHARED compound skeleton, never a hand array.
 *
 * It replaced `DEAD_COLUMNS`, a page-local `AdminTableColumn[]` literal
 * carrying four JSX cells over `Record<string, unknown>` rows: a second table
 * engine's column type, with no header sort, no Fields picker and no org
 * binding, because that engine never grew them.
 *
 * The skeleton mounts WHOLE — no `.filter`. A dead-stock row has no photo, so
 * the gutter paints the typed placeholder exactly as `cycle-counts`,
 * `part-compatibility` and `kiosk-slot-events` already do; filtering `thumb`
 * off the mount would need a new `COMPOUND_SKELETON_FILTER_DEBT` row and that
 * list is documented shrink-only. Chrome headers are family DATA and are
 * relabelled (SKU · Product · Last move · Dormant); geometry is the engine's.
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  REPORT_DEAD_STOCK_FIELD_CATALOG,
  REPORT_DEAD_STOCK_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/report-dead-stock';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
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

export interface ReportDeadStockGridColumn
  extends Omit<LedgerGridColumnModel, 'key'>,
    SlotTrackFields {
  key: ReportDeadStockGridColumnKey;
  sortable?: boolean;
}

/** Materialize the mounted columns from an effective layout. */
export function reportDeadStockCompoundColumnsFor(
  layout: SlotLayout,
): readonly ReportDeadStockGridColumn[] {
  const tracks = materializeTracks<ReportDeadStockGridColumn>({
    layout,
    catalog: REPORT_DEAD_STOCK_FIELD_CATALOG,
    base: compoundColumnsFor<ReportDeadStockGridColumn>(),
  });
  // The identity slot IS the shared `fulfillment` chrome track. Its WORD is
  // the engine's `Id` on every peer (`slot-table-id-header-law.ts`); this
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
    // The pill carries the DORMANCY COUNT. `slotDisplayType` is set WITHOUT a
    // `fieldId` on purpose: the engine types the sort comparator from it (so
    // 184 beats 90 instead of losing to it lexically) and reads `fieldId` to
    // decide which tracks get a resolved slot value — and the state cell
    // paints `view.stateLabel`, never a slot.
    if (t.key === 'state') {
      return {
        ...t,
        label: 'Dormant',
        gridLabel: 'Dormant',
        slotDisplayType: 'number' as const,
      };
    }
    return t;
  });
}

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const REPORT_DEAD_STOCK_COMPOUND_COLUMNS: readonly ReportDeadStockGridColumn[] =
  reportDeadStockCompoundColumnsFor(REPORT_DEAD_STOCK_PRODUCT_LAYOUT);

/**
 * The FACT a column sorts by, or null when it offers no sort.
 *
 * Every painted DATA track answers, including the four the chrome paints: a
 * labeled header with a dead click fails `SLOT_TABLE_PAINT_LAW.headerSort`.
 * Structural chrome is named by `isSlotTableChromeTrack`, never by a hand list
 * that could drift from the law.
 */
export function reportDeadStockSortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (col.sortable === false) return null;
  if (isSlotTableChromeTrack(col.key)) return null;
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
