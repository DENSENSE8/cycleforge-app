/**
 * Inventory › Ledger activity column model — MATERIALIZED from a
 * {@link SlotLayout} onto the SHARED compound skeleton, never a hand array.
 *
 * A row is one inventory event: what happened to a unit, when, where and by
 * whom. It replaced a `<ul>` of `EventRow` cards — a display with fixed spans,
 * no header, no sort and no Fields picker, which is exactly the second table
 * the one-table SoT exists to prevent.
 *
 * The first port (2026-09-04, morning) materialized its own SHEET skeleton with
 * a frozen `sku` track, which is why the Ledger painted a thin one-line
 * spreadsheet instead of To-ship's two-line WMS row. There is nothing about an
 * inventory event that wants a different row shape, so the base is now
 * {@link compoundColumnsFor} — the same tracks Orders, Receiving, Incoming and
 * Tasks mount — and the identity fact resolves into the shared `fulfillment`
 * track exactly as `materialize-tracks.ts` documents.
 *
 * Sort and frozen-offset helpers derive from the MOUNTED model, never a module
 * constant.
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  INVENTORY_EVENTS_FIELD_CATALOG,
  INVENTORY_EVENTS_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/inventory-events';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type InventoryEventsGridColumnKey =
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
 * One column of the ledger. EXTENDS the house model rather than re-declaring
 * it — every shared field is inherited and only `key` narrows, which is what
 * stops this family drifting from the same field on every other surface.
 */
export interface InventoryEventsGridColumn
  extends Omit<LedgerGridColumnModel, 'key'>,
    SlotTrackFields {
  key: InventoryEventsGridColumnKey;
}

/**
 * Materialize the mounted ledger columns from an effective layout.
 *
 * Two shared tracks are filtered off this MOUNT (never removed from
 * `COMPOUND_TRACKS`):
 *
 * - `dates` — an inventory event has no start-over-deadline pair. The ledger's
 *   one date, `occurred`, is a bound STATUS track: a ledger is ORDERED by time,
 *   and a sortable track orders it where a chrome cell would only display it.
 * - `select` — the ledger is a read map (`multiSelect: false`). A gutter
 *   checkbox that selects rows nothing can act on is a control with no verb.
 */
export function inventoryEventsCompoundColumnsFor(
  layout: SlotLayout,
): readonly InventoryEventsGridColumn[] {
  const base = compoundColumnsFor<InventoryEventsGridColumn>().filter(c => c.key !== 'dates' && c.key !== 'select');
  return materializeTracks<InventoryEventsGridColumn>({
    layout,
    catalog: INVENTORY_EVENTS_FIELD_CATALOG,
    base,
  });
}

/**
 * The PRODUCT-DEFAULT materialization — what an org with no override mounts,
 * the canonical columns of the binding, and the guard SoT.
 */
export const INVENTORY_EVENTS_COMPOUND_COLUMNS: readonly InventoryEventsGridColumn[] =
  inventoryEventsCompoundColumnsFor(INVENTORY_EVENTS_PRODUCT_LAYOUT);

/**
 * The FACT a column sorts by, or null when it offers no sort.
 *
 * `inventory-events.status_change` and `inventory-events.bin` are deliberately
 * unsortable wherever they are bound: each is a TRANSITION of two independent
 * values, so ordering it would compare whichever end happened to be first.
 * That rule belongs to the FACT, not to a track key — a rebind must carry it.
 *
 * Chrome tracks (`thumb`, `_fill`, the gutters) carry no `fieldId` and fall
 * through to `null`, which is what keeps them out of the header-sort law.
 */
export function inventoryEventsSortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (col.sortable === false) return null;
  // The identity slot IS the shared fulfillment track on a compound row.
  if (col.key === 'fulfillment') return 'inventory-events.sku';
  if (col.key === 'item') return 'inventory-events.sku';
  if (col.fieldId === 'inventory-events.status_change') return null;
  if (col.fieldId === 'inventory-events.bin') return null;
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isInventoryEventsColumnSortable(
  columns: readonly InventoryEventsGridColumn[],
  key: string,
): key is InventoryEventsGridColumnKey {
  return columns.some((c) => c.key === key && inventoryEventsSortFactFor(c) !== null);
}

/**
 * Default direction on first activation: a ledger reads newest first, names and
 * ids alphabetically.
 */
export function defaultDirForInventoryEventsColumn(
  columns: readonly InventoryEventsGridColumn[],
  key: string,
): GridSortDir {
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}
