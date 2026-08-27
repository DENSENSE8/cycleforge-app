/**
 * Review · Missing item number — column model for sheet rows that never became
 * orders. Sibling of `catalog-link-grid-layout.ts`, never a merge: the two tabs
 * share a surface and not their identity facts.
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import { GRID_FILL_COLUMN } from '@/design-system/components/grid';
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
  | 'state'
  | 'amount'
  | 'actions'
  | '_fill';

export interface ImportExceptionGridColumn {
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

export const IMPORT_EXCEPTION_GRID_COLUMNS: readonly ImportExceptionGridColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', sortable: false, frozen: true },
  {
    key: 'order',
    width: 'minmax(10rem, 10rem)',
    label: 'Order',
    type: 'id',
    hideKey: 'order',
    resizable: true,
    omitCellIcon: true,
    labelFitRem: 5,
  },
  {
    key: 'source',
    width: 'minmax(6rem, 6rem)',
    label: 'Account',
    type: 'external',
    hideKey: 'source',
    labelFitRem: 5,
  },
  {
    key: 'tracking',
    width: 'minmax(10rem, 10rem)',
    label: 'Tracking',
    type: 'tracking',
    hideKey: 'tracking',
    resizable: true,
    omitCellIcon: true,
    labelFitRem: 5.5,
  },
  {
    key: 'sheet',
    width: 'minmax(5.5rem, 5.5rem)',
    label: 'Sheet row',
    type: 'number',
    align: 'end',
    hideKey: 'sheet',
    labelFitRem: 6,
  },
  {
    key: 'seen',
    width: 'minmax(4.5rem, 4.5rem)',
    label: 'Seen',
    type: 'number',
    align: 'end',
    hideKey: 'seen',
    labelFitRem: 4,
  },
  {
    key: 'first',
    width: 'minmax(7rem, 7rem)',
    label: 'First seen',
    type: 'date',
    dateFace: 'stamp',
    hideKey: 'first',
    tier: 'optional',
    labelFitRem: 6,
  },
  {
    key: 'last',
    width: 'minmax(7rem, 7rem)',
    label: 'Last seen',
    type: 'date',
    dateFace: 'stamp',
    hideKey: 'last',
    labelFitRem: 6,
  },
  GRID_FILL_COLUMN,
] as const;

export const IMPORT_EXCEPTION_COMPOUND_COLUMNS: readonly ImportExceptionGridColumn[] =
  compoundColumnsFor<ImportExceptionGridColumn>();

const IMPORT_EXCEPTION_GRID_SORTABLE_KEYS: readonly ImportExceptionGridColumnKey[] = [
  ...IMPORT_EXCEPTION_GRID_COLUMNS.filter((c) => c.sortable !== false && c.key !== 'select').map(
    (c) => c.key,
  ),
  'item',
  'fulfillment',
  'state',
  'amount',
];

export function isImportExceptionGridSortable(key: string): key is ImportExceptionGridColumnKey {
  return (IMPORT_EXCEPTION_GRID_SORTABLE_KEYS as readonly string[]).includes(key);
}

export function defaultDirForImportExceptionGridSort(
  key: ImportExceptionGridColumnKey,
): GridSortDir {
  return key === 'last' || key === 'first' || key === 'seen' || key === 'amount' || key === 'state'
    ? 'desc'
    : 'asc';
}
