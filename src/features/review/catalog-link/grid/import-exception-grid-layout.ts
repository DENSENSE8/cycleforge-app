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
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';

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
  | 'amount'
  | 'actions'
  | '_fill'
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


export function importExceptionCompoundColumnsFor(
  layout: SlotLayout,
): readonly ImportExceptionGridColumn[] {
  return materializeTracks<ImportExceptionGridColumn>({
    layout,
    catalog: IMPORT_EXCEPTION_FIELD_CATALOG,
    base: compoundColumnsFor(),
  });
}

/**
 * The PRODUCT-DEFAULT materialization — what an org with no override mounts.
 * With the product layout's empty band that is the shared `COMPOUND_TRACKS`
 * verbatim, so the port reproduces the queue exactly and every catalog fact
 * becomes bindable without a deploy.
 */
export const IMPORT_EXCEPTION_COMPOUND_COLUMNS: readonly ImportExceptionGridColumn[] =
  importExceptionCompoundColumnsFor(IMPORT_EXCEPTION_PRODUCT_LAYOUT);

const IMPORT_EXCEPTION_GRID_SORTABLE_KEYS: readonly ImportExceptionGridColumnKey[] = [
  'dates',
  'order',
  'source',
  'tracking',
  'sheet',
  'seen',
  'first',
  'last',
  'item',
  'fulfillment',
  'state',
  'amount',
];

export function isImportExceptionGridSortable(key: string): key is ImportExceptionGridColumnKey {
  if (isSlotTableChromeTrack(key)) return false;
  return (IMPORT_EXCEPTION_GRID_SORTABLE_KEYS as readonly string[]).includes(key);
}

/**
 * The comparator shape each sort word uses.
 *
 * Read off the FLAT column array until wave 1.3 moved the mount to compound
 * tracks, at which point `.find(c => c.key === 'state')` returned `undefined`
 * and every compound-track sort silently fell back to the default shape — a
 * date comparing as text. Declared here so a word with no flat twin still names
 * its own shape. Both spellings are kept: the flat words are what live
 * bookmarks carry, the track keys are what the mounted header emits.
 */
export const IMPORT_EXCEPTION_SORT_TYPES: Readonly<Record<string, ColumnType>> = {
  dates: 'date',
  item: 'text',
  order: 'id',
  fulfillment: 'id',
  source: 'external',
  tracking: 'tracking',
  sheet: 'number',
  seen: 'number',
  amount: 'number',
  first: 'date',
  last: 'date',
  state: 'date',
};

export function defaultDirForImportExceptionGridSort(
  key: ImportExceptionGridColumnKey,
): GridSortDir {
  return key === 'last' || key === 'first' || key === 'seen' || key === 'amount' || key === 'state'
    ? 'desc'
    : 'asc';
}
