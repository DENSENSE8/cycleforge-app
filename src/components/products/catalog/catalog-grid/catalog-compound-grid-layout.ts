import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import { CATALOG_FIELD_CATALOG, CATALOG_PRODUCT_LAYOUT } from '@/lib/tables/field-catalog/catalog';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export type CatalogGridColumnKey =
  | 'select'
  | 'fulfillment'
  | 'thumb'
  | 'item'
  | 'dates'
  | 'state'
  | '_fill'
  | `status:${number}`
  | `subtitle:${number}`;

export interface CatalogGridColumn extends Omit<LedgerGridColumnModel, 'key'>, SlotTrackFields {
  key: CatalogGridColumnKey;
}

export function catalogCompoundColumnsFor(layout: SlotLayout): readonly CatalogGridColumn[] {
  const tracks = materializeTracks<CatalogGridColumn>({
    layout,
    catalog: CATALOG_FIELD_CATALOG,
    base: compoundColumnsFor<CatalogGridColumn>(),
  });
  const identity = CATALOG_FIELD_CATALOG.find((field) => field.id === layout.identityFieldId);
  return tracks.map((track) => {
    if (track.key === 'fulfillment' && identity) {
      return { ...track, fieldId: identity.id, slotDisplayType: identity.displayType };
    }
    if (track.key === 'item') return { ...track, label: 'Product', gridLabel: 'Product' };
    if (track.key === 'dates') return { ...track, label: 'Channels', gridLabel: 'Channels' };
    if (track.key === 'state') return { ...track, label: 'Status', gridLabel: 'Status' };
    return track;
  });
}

export const CATALOG_COMPOUND_COLUMNS = catalogCompoundColumnsFor(CATALOG_PRODUCT_LAYOUT);

export function catalogCompoundSortFactFor(column: { key: string; fieldId?: string; sortable?: boolean }): string | null {
  if (column.sortable === false || isSlotTableChromeTrack(column.key)) return null;
  if (column.key === 'fulfillment') return 'catalog.sku';
  if (column.key === 'item') return 'catalog.title';
  if (column.key === 'dates') return 'catalog.platforms';
  if (column.key === 'state') return 'catalog.status';
  return column.fieldId ?? null;
}

export function isCatalogCompoundColumnSortable(columns: readonly CatalogGridColumn[], key: string): key is CatalogGridColumnKey {
  return columns.some((column) => column.key === key && catalogCompoundSortFactFor(column) !== null);
}

export function defaultDirForCatalogCompoundColumn(columns: readonly CatalogGridColumn[], key: string): GridSortDir {
  const display = columns.find((column) => column.key === key)?.slotDisplayType;
  return display === 'date' || display === 'money' || display === 'number' ? 'desc' : 'asc';
}
