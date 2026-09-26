/**
 * Review · Missing item number — column model for sheet rows that never became
 * orders. Sibling of `catalog-link-grid-layout.ts`, never a merge: the two tabs
 * share a surface and not their identity facts.
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  IMPORT_EXCEPTION_FIELD_CATALOG,
  IMPORT_EXCEPTION_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/import-exception';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import type { ColumnType } from '@/lib/tables/table-columns';

export type ImportExceptionGridColumnKey =
  | 'select'
  | 'order'
  | 'source'
  | 'tracking'
  | 'sheet'
  | 'seen'
  | 'first'
  | 'last'
  /** Compound (two-row) presentation tracks — see {@link IMPORT_EXCEPTION_COMPOUND_COLUMNS}. */
  | 'thumb'
  | 'item'
  | 'fulfillment'
  | 'dates'
  | 'state'
  | 'actions'
  | '_fill'
  /** Legacy URL `?colsort=amount` bookmark — not a chrome track. */
  | 'amount'
  /** Materialized slot tracks — keys are slot indices, never field ids. */
  | `status:${number}`
  | `subtitle:${number}`;

export interface ImportExceptionGridColumn extends SlotTrackFields {
  key: ImportExceptionGridColumnKey;
  width: string;
  label?: string;
  gridLabel?: string;
  labelFitRem?: number;
  type?: ColumnType;
  dateFace?: 'day' | 'stamp' | 'duration';
  align?: 'start' | 'end';
  frozen?: boolean;
  sortable?: boolean;
  hideKey?: string;
  tier?: 'core' | 'optional';
  resizable?: boolean;
  omitCellIcon?: boolean;
}

/** Canonical Missing item number columns, in scan order. */
export function importExceptionCompoundColumnsFor(
  layout: SlotLayout,
): readonly ImportExceptionGridColumn[] {
  return materializeTracks<ImportExceptionGridColumn>({
    layout,
    catalog: IMPORT_EXCEPTION_FIELD_CATALOG,
    base: compoundColumnsFor<ImportExceptionGridColumn>(),
  });
}

/** The PRODUCT-DEFAULT materialization — what an org with no override mounts. */
export const IMPORT_EXCEPTION_COMPOUND_COLUMNS: readonly ImportExceptionGridColumn[] =
  importExceptionCompoundColumnsFor(IMPORT_EXCEPTION_PRODUCT_LAYOUT);

/** The `?colsort=` vocabulary. */
const IMPORT_EXCEPTION_GRID_SORTABLE_KEYS: readonly ImportExceptionGridColumnKey[] = [
  'order',
  'source',
  'tracking',
  'sheet',
  'seen',
  'first',
  'last',
  'item',
  'fulfillment',
  'dates',
  'state',
];

export function isImportExceptionGridSortable(key: string): key is ImportExceptionGridColumnKey {
  return (IMPORT_EXCEPTION_GRID_SORTABLE_KEYS as readonly string[]).includes(key);
}

/** The comparator shape each sort word uses. */
export const IMPORT_EXCEPTION_SORT_TYPES: Readonly<Record<string, ColumnType>> = {
  dates: 'date',
  item: 'text',
  order: 'id',
  fulfillment: 'id',
  source: 'external',
  tracking: 'tracking',
  sheet: 'number',
  seen: 'number',
  first: 'date',
  last: 'date',
  state: 'date',
};

export function defaultDirForImportExceptionGridSort(
  key: ImportExceptionGridColumnKey,
): GridSortDir {
  return key === 'last' || key === 'first' || key === 'seen' || key === 'state'
    ? 'desc'
    : 'asc';
}
