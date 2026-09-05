/**
 * Reports › Dead stock — compound column model.
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  DEAD_STOCK_FIELD_CATALOG,
  DEAD_STOCK_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/dead-stock';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type DeadStockGridColumnKey =
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

export interface DeadStockGridColumn extends SlotTrackFields {
  key: DeadStockGridColumnKey;
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

export function deadStockCompoundColumnsFor(layout: SlotLayout): readonly DeadStockGridColumn[] {
  return materializeTracks<DeadStockGridColumn>({
    layout,
    catalog: DEAD_STOCK_FIELD_CATALOG,
    base: compoundColumnsFor(),
  });
}

export const DEAD_STOCK_COMPOUND_COLUMNS: readonly DeadStockGridColumn[] =
  deadStockCompoundColumnsFor(DEAD_STOCK_PRODUCT_LAYOUT);

export type DeadStockSortFact =
  | 'sku'
  | 'product'
  | 'days'
  | 'stock'
  | 'dates'
  | 'order'
  | 'amount';

const DEAD_STOCK_SORT_FACTS: readonly DeadStockSortFact[] = [
  'sku',
  'dates',
  'product',
  'days',
  'stock',
  'order',
  'amount',
];

const DEAD_STOCK_TRACK_SORT_FACTS: Readonly<Record<string, DeadStockSortFact>> = {
  // The compound DATES track. This family paints no dates in it (no deadline,
  // no start stamp), and an empty track still click-sorts — the same rule
  // `fulfillment` / `amount` already answer to here. The word is its
  // own so a bookmark keeps meaning what it said.
  dates: 'dates',
  item: 'sku',
  state: 'days',
  fulfillment: 'order',
  amount: 'amount',
};

const DEAD_STOCK_SLOT_SORT_FACTS: Readonly<Record<string, DeadStockSortFact>> = {
  'dead-stock.sku': 'sku',
  'dead-stock.product': 'product',
  'dead-stock.days': 'days',
  'dead-stock.stock': 'stock',
};

export function deadStockSortFactFor(
  col: Pick<DeadStockGridColumn, 'key' | 'sortable' | 'fieldId'>,
): DeadStockSortFact | null {
  if (isSlotTableChromeTrack(col.key) || col.sortable === false) return null;
  const slot = col.fieldId ? DEAD_STOCK_SLOT_SORT_FACTS[col.fieldId] : undefined;
  if (slot) return slot;
  return DEAD_STOCK_TRACK_SORT_FACTS[col.key] ?? null;
}

export function isDeadStockSortFact(raw: string): raw is DeadStockSortFact {
  return (DEAD_STOCK_SORT_FACTS as readonly string[]).includes(raw);
}

export function isDeadStockGridSortable(
  columns: readonly DeadStockGridColumn[],
  key: string,
): boolean {
  const col = columns.find((c) => c.key === key);
  return col ? deadStockSortFactFor(col) != null : false;
}

export function deadStockColumnKeyForSort(
  columns: readonly DeadStockGridColumn[],
  fact: DeadStockSortFact | null,
): DeadStockGridColumnKey | null {
  if (!fact) return null;
  return columns.find((c) => deadStockSortFactFor(c) === fact)?.key ?? null;
}

export const DEAD_STOCK_SORT_FACT_TYPES: Readonly<Record<DeadStockSortFact, ColumnType>> = {
  sku: 'text',
  dates: 'date',
  product: 'text',
  days: 'number',
  stock: 'number',
  order: 'text',
  amount: 'price',
};

export function defaultDirForDeadStockGridSort(fact: DeadStockSortFact): GridSortDir {
  return fact === 'days' || fact === 'stock' || fact === 'amount'
    ? 'desc'
    : 'asc';
}
