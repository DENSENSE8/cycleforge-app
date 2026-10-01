/** Inventory › Ledger activity column model — MATERIALIZED from a {@link DataTableColumnLayout} onto the SHARED compound skeleton, never a hand array. */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  INVENTORY_EVENTS_FIELD_CATALOG,
  INVENTORY_EVENTS_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/inventory-events';
import { materializeTracks, type DataTableColumnFields } from '@/lib/tables/materialize-tracks';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';
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
export interface InventoryEventsGridColumn extends Omit<LedgerGridColumnModel, 'key'>, DataTableColumnFields { key: InventoryEventsGridColumnKey; }

/** Materialize the mounted ledger columns from an effective layout. */
export function inventoryEventsCompoundColumnsFor(layout: DataTableColumnLayout): readonly InventoryEventsGridColumn[] { const base = compoundColumnsFor<InventoryEventsGridColumn>().filter(c => c.key !== 'dates' && c.key !== 'select');
return materializeTracks<InventoryEventsGridColumn>({
  layout,
  catalog: INVENTORY_EVENTS_FIELD_CATALOG,
  base,
}); }

/**
 * The PRODUCT-DEFAULT materialization — what an org with no override mounts,
 * the canonical columns of the binding, and the guard SoT.
 */
export const INVENTORY_EVENTS_COMPOUND_COLUMNS: readonly InventoryEventsGridColumn[] =
  inventoryEventsCompoundColumnsFor(INVENTORY_EVENTS_PRODUCT_LAYOUT);

/** The FACT a column sorts by, or null when it offers no sort. */
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
