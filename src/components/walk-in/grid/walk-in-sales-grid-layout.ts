/** Walk-in sales column model — MATERIALIZED from a SlotLayout onto the shared compound skeleton, never a hand array. */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  WALKINSALES_FIELD_CATALOG,
  WALKINSALES_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/walk-in-sales';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type WalkInSalesGridColumnKey =
  | 'select'
  | 'fulfillment'
  | 'thumb'
  | 'item'
  | 'dates'
  | 'state'
  | '_fill'
  | `status:${number}`
  | `subtitle:${number}`;

export interface WalkInSalesGridColumn
  extends Omit<LedgerGridColumnModel, 'key'>,
    SlotTrackFields {
  key: WalkInSalesGridColumnKey;
}

export function walkInSalesCompoundColumnsFor(
  layout: SlotLayout,
): readonly WalkInSalesGridColumn[] {
  const base = compoundColumnsFor<WalkInSalesGridColumn>();
  const tracks = materializeTracks<WalkInSalesGridColumn>({
    layout,
    catalog: WALKINSALES_FIELD_CATALOG,
    base,
  });
  // The identity slot IS the shared `fulfillment` chrome track. Its WORD is
  // the engine's `Id` on every peer (`slot-table-family.ts`); this
  // family supplies only the FACT the chip paints and its header sorts by.
  const identity = WALKINSALES_FIELD_CATALOG.find((f) => f.id === layout.identityFieldId);
  return tracks.map((t) => {
    if (t.key === 'fulfillment' && identity) {
      return {
        ...t,
        type: 'id' as const,
        fieldId: identity.id,
        slotDisplayType: identity.displayType,
      };
    }
    if (t.key === 'dates') {
      return {
        ...t,
        label: 'Completed',
        gridLabel: 'Completed',
      };
    }
    return t;
  });
}

export const WALKINSALES_COMPOUND_COLUMNS: readonly WalkInSalesGridColumn[] =
  walkInSalesCompoundColumnsFor(WALKINSALES_PRODUCT_LAYOUT);

export function walkInSalesSortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (col.sortable === false) return null;
  if (col.key === 'fulfillment') return 'walk-in-sales.id';
  if (col.key === 'item') return 'walk-in-sales.customer';
  if (col.key === 'state') return 'walk-in-sales.status';
  if (col.key === 'dates') return 'walk-in-sales.created';
  return col.fieldId ?? null;
}

export function isWalkInSalesColumnSortable(
  columns: readonly WalkInSalesGridColumn[],
  key: string,
): key is WalkInSalesGridColumnKey {
  return columns.some((c) => c.key === key && walkInSalesSortFactFor(c) !== null);
}

export function defaultDirForWalkInSalesColumn(
  columns: readonly WalkInSalesGridColumn[],
  key: string,
): GridSortDir {
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}
