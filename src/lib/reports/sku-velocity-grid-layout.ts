/**
 * Reports › SKU velocity — compound column model.
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  SKU_VELOCITY_FIELD_CATALOG,
  SKU_VELOCITY_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/sku-velocity';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type SkuVelocityGridColumnKey =
  | 'select'
  | 'thumb'
  | 'item'
  | 'fulfillment'
  | 'dates'
  | 'state'
  | 'actions'
  | '_fill'
  | `status:${number}`
  | `subtitle:${number}`;

export interface SkuVelocityGridColumn extends SlotTrackFields {
  key: SkuVelocityGridColumnKey;
  width: string;
  label?: string;
  gridLabel?: string;
  labelFitRem?: number;
  type?: ColumnType;
  align?: 'start' | 'end';
  frozen?: boolean;
  sortable?: boolean;
  hideKey?: string;
  tier?: 'core' | 'optional';
  resizable?: boolean;
  omitCellIcon?: boolean;
}

/**
 * The shared skeleton with `dates` opted OUT of the default view.
 *
 * This family binds THREE status facts (tier · out · in), so it is the densest
 * compound mount in the product: with `dates` shipping on it opens twelve
 * tracks and `parseTableDefinition` refuses it against
 * `MAX_DEFAULT_VISIBLE_TRACKS` — the ceiling that keeps a row readable without
 * horizontal scroll.
 *
 * `dates` is the right track to demote HERE and nowhere else: a velocity
 * ranking has no deadline and no start stamp, so the adapter paints neither
 * line (`delay: null`, no `orderedAt`) and the default view would spend a
 * column on two dashes. `tier: 'optional'` keeps it one click away in the
 * column-display rail rather than deleting it from a shared model.
 */
function skuVelocityBaseTracks(): readonly SkuVelocityGridColumn[] {
  return compoundColumnsFor<SkuVelocityGridColumn>().map((track) =>
    track.key === 'dates' ? { ...track, tier: 'optional' as const } : track,
  );
}

export function skuVelocityCompoundColumnsFor(
  layout: SlotLayout,
): readonly SkuVelocityGridColumn[] {
  return materializeTracks<SkuVelocityGridColumn>({
    layout,
    catalog: SKU_VELOCITY_FIELD_CATALOG,
    base: skuVelocityBaseTracks(),
  });
}

export const SKU_VELOCITY_COMPOUND_COLUMNS: readonly SkuVelocityGridColumn[] =
  skuVelocityCompoundColumnsFor(SKU_VELOCITY_PRODUCT_LAYOUT);

export type SkuVelocitySortFact =
  | 'sku'
  | 'dates'
  | 'product'
  | 'tier'
  | 'out'
  | 'in'
  | 'stock'
  | 'order'
  | 'amount';

const SKU_VELOCITY_SORT_FACTS: readonly SkuVelocitySortFact[] = [
  'sku',
  'dates',
  'product',
  'tier',
  'out',
  'in',
  'stock',
  'order',
  'amount',
];

const SKU_VELOCITY_TRACK_SORT_FACTS: Readonly<Record<string, SkuVelocitySortFact>> = {
  // The compound DATES track. This family paints no dates in it (no deadline,
  // no start stamp), and an empty track still click-sorts — the same rule
  // `fulfillment` / `amount` already answer to here. The word is its
  // own so a bookmark keeps meaning what it said.
  dates: 'dates',
  item: 'sku',
  state: 'tier',
  fulfillment: 'order',
  amount: 'amount',
};

const SKU_VELOCITY_SLOT_SORT_FACTS: Readonly<Record<string, SkuVelocitySortFact>> = {
  'sku-velocity.sku': 'sku',
  'sku-velocity.product': 'product',
  'sku-velocity.tier': 'tier',
  'sku-velocity.out': 'out',
  'sku-velocity.in': 'in',
  'sku-velocity.stock': 'stock',
};

export function skuVelocitySortFactFor(
  col: Pick<SkuVelocityGridColumn, 'key' | 'sortable' | 'fieldId'>,
): SkuVelocitySortFact | null {
  if (isSlotTableChromeTrack(col.key) || col.sortable === false) return null;
  const slot = col.fieldId ? SKU_VELOCITY_SLOT_SORT_FACTS[col.fieldId] : undefined;
  if (slot) return slot;
  return SKU_VELOCITY_TRACK_SORT_FACTS[col.key] ?? null;
}

export function isSkuVelocitySortFact(raw: string): raw is SkuVelocitySortFact {
  return (SKU_VELOCITY_SORT_FACTS as readonly string[]).includes(raw);
}

export function isSkuVelocityGridSortable(
  columns: readonly SkuVelocityGridColumn[],
  key: string,
): boolean {
  const col = columns.find((c) => c.key === key);
  return col ? skuVelocitySortFactFor(col) != null : false;
}

export function skuVelocityColumnKeyForSort(
  columns: readonly SkuVelocityGridColumn[],
  fact: SkuVelocitySortFact | null,
): SkuVelocityGridColumnKey | null {
  if (!fact) return null;
  return columns.find((c) => skuVelocitySortFactFor(c) === fact)?.key ?? null;
}

export const SKU_VELOCITY_SORT_FACT_TYPES: Readonly<Record<SkuVelocitySortFact, ColumnType>> = {
  sku: 'text',
  dates: 'date',
  product: 'text',
  tier: 'tag',
  out: 'number',
  in: 'number',
  stock: 'number',
  order: 'text',
  amount: 'price',
};

export function defaultDirForSkuVelocityGridSort(fact: SkuVelocitySortFact): GridSortDir {
  return fact === 'out' || fact === 'in' || fact === 'stock' || fact === 'amount'
    ? 'desc'
    : 'asc';
}
