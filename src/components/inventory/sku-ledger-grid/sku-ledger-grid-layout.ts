/**
 * Stock-ledger column model — MATERIALIZED from a {@link SlotLayout} onto the
 * SHARED compound skeleton, never a hand array.
 *
 * It replaced six hand-written `AdminTableColumn` objects carrying JSX — a
 * second table engine's column type, with no header sort, no Fields picker and
 * no org binding, because that engine never grew them.
 *
 * The skeleton mounts WHOLE — no `.filter`. The photo gutter has no photo on a
 * ledger row and paints the typed placeholder, exactly as `kiosk-slot-events`
 * and `audit-log` already do: `COMPOUND_SKELETON_FILTER_DEBT` is documented
 * shrink-only, and a new desk cutting chrome to taste is the fork the law
 * names. Chrome headers are RENAMED into this family's vocabulary instead
 * (Order · Reason · When · Dimension) — a label is family data, geometry is
 * the engine's.
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  SKU_LEDGER_FIELD_CATALOG,
  SKU_LEDGER_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/sku-ledger';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type SkuLedgerGridColumnKey =
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

/**
 * One column of the ledger pane. EXTENDS the house model rather than
 * re-declaring it — every shared field is inherited and only `key` narrows.
 */
export interface SkuLedgerGridColumn extends Omit<LedgerGridColumnModel, 'key'>, SlotTrackFields {
  key: SkuLedgerGridColumnKey;
}

/** Materialize the mounted columns from an effective layout. */
export function skuLedgerCompoundColumnsFor(layout: SlotLayout): readonly SkuLedgerGridColumn[] {
  const tracks = materializeTracks<SkuLedgerGridColumn>({
    layout,
    catalog: SKU_LEDGER_FIELD_CATALOG,
    base: compoundColumnsFor<SkuLedgerGridColumn>(),
  });
  // The identity slot IS the shared `fulfillment` chrome track. Its WORD is
  // the engine's `Id` on every peer (`slot-table-family.ts`); this
  // family supplies only the FACT the chip paints and its header sorts by.
  const identity = SKU_LEDGER_FIELD_CATALOG.find((f) => f.id === layout.identityFieldId);
  return tracks.map((t) => {
    if (t.key === 'fulfillment' && identity) {
      return {
        ...t,
        type: 'id' as const,
        fieldId: identity.id,
        slotDisplayType: identity.displayType,
      };
    }
    // The title line is WHY the stock moved — a ledger row is an event, not an
    // item.
    if (t.key === 'item') return { ...t, label: 'Reason', gridLabel: 'Reason' };
    // One temporal fact on this desk: when the movement was recorded.
    if (t.key === 'dates') return { ...t, label: 'When', gridLabel: 'When' };
    // The pill the retired `Dim` cell painted as bare prose.
    if (t.key === 'state') return { ...t, label: 'Dimension', gridLabel: 'Dimension' };
    return t;
  });
}

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const SKU_LEDGER_COMPOUND_COLUMNS: readonly SkuLedgerGridColumn[] =
  skuLedgerCompoundColumnsFor(SKU_LEDGER_PRODUCT_LAYOUT);

/**
 * The FACT a column sorts by, or null when it offers no sort.
 *
 * Every painted DATA track answers, including the four chrome tracks this
 * family paints facts into — a painted DATA header with a dead sort fails
 * `SLOT_TABLE_PAINT_LAW.headerSort`. Structural chrome is named by
 * `isSlotTableChromeTrack`, never by a hand list that could drift from the law.
 */
export function skuLedgerSortFactFor(col: {
  key: string;
  fieldId?: string;
  sortable?: boolean;
}): string | null {
  if (col.sortable === false) return null;
  if (isSlotTableChromeTrack(col.key)) return null;
  // The identity slot IS the shared fulfillment track on a compound row.
  if (col.key === 'fulfillment') return 'sku-ledger.ref_order';
  if (col.key === 'item') return 'sku-ledger.reason';
  if (col.key === 'state') return 'sku-ledger.dimension';
  // The Dates chrome paints the movement's stamp, so its header sorts that
  // fact — and reordering a stock ledger by time is the first thing anybody
  // does with one.
  if (col.key === 'dates') return 'sku-ledger.when';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isSkuLedgerColumnSortable(
  columns: readonly SkuLedgerGridColumn[],
  key: string,
): key is SkuLedgerGridColumnKey {
  return columns.some((c) => c.key === key && skuLedgerSortFactFor(c) !== null);
}

/** Dates and counts read newest/highest first; names and ids alphabetically. */
export function defaultDirForSkuLedgerColumn(
  columns: readonly SkuLedgerGridColumn[],
  key: string,
): GridSortDir {
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}
