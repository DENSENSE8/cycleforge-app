/**
 * Shortage coverage CSV staging spreadsheet — Ready / Action required plus
 * the SoT coverage face. Clone of the orders-import sheet skeleton
 * (`select · order · status` + bound facts + `_fill`).
 */

import {
  gridFrozenLeft,
  gridTemplate,
} from '@/design-system/components/grid/grid-column-geometry';
import { GRID_FILL_COLUMN } from '@/design-system/components/grid';
import {
  SHORTAGE_COVERAGE_IMPORT_FIELD_CATALOG,
  SHORTAGE_COVERAGE_IMPORT_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/shortage-coverage-import';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type ShortageCoverageStagingGridColumnKey =
  | 'select'
  | 'order'
  | 'status'
  | '_fill'
  | `status:${number}`
  | `subtitle:${number}`;

export interface ShortageCoverageStagingGridColumn extends SlotTrackFields {
  key: ShortageCoverageStagingGridColumnKey;
  width: string;
  label?: string;
  gridLabel?: string;
  labelFitRem?: number;
  type?: ColumnType;
  minTrackRem?: number;
  align?: 'start' | 'end';
  frozen?: boolean;
  hideKey?: string;
  tier?: 'core' | 'optional';
  sortable?: boolean;
}

const SHORTAGE_COVERAGE_STAGING_SHEET_BASE: readonly ShortageCoverageStagingGridColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', sortable: false, frozen: true },
  {
    key: 'order',
    frozen: true,
    width: 'minmax(9rem, 9rem)',
    label: 'Order number',
    gridLabel: 'Order',
    type: 'id',
    labelFitRem: 5,
  },
  {
    key: 'status',
    width: 'minmax(9rem, 9rem)',
    label: 'Status',
    gridLabel: 'Status',
    type: 'tag',
    labelFitRem: 4.5,
  },
  { ...GRID_FILL_COLUMN, key: '_fill' as const },
];

export function shortageCoverageStagingSheetColumnsFor(
  layout: SlotLayout,
): readonly ShortageCoverageStagingGridColumn[] {
  return materializeTracks<ShortageCoverageStagingGridColumn>({
    layout,
    catalog: SHORTAGE_COVERAGE_IMPORT_FIELD_CATALOG,
    base: SHORTAGE_COVERAGE_STAGING_SHEET_BASE,
    statusAnchorKey: 'status',
    subtitleAnchorKey: 'status',
  });
}

export const SHORTAGE_COVERAGE_STAGING_SHEET_COLUMNS: readonly ShortageCoverageStagingGridColumn[] =
  shortageCoverageStagingSheetColumnsFor(SHORTAGE_COVERAGE_IMPORT_PRODUCT_LAYOUT);

export function shortageCoverageStagingSortFactFor(
  col: ShortageCoverageStagingGridColumn,
): string | null {
  if (col.sortable === false || col.key === 'select' || col.key === '_fill') return null;
  if (col.key === 'order') return 'shortage-coverage-import.order';
  if (col.key === 'status') return 'status';
  return col.fieldId ?? null;
}

export function isShortageCoverageStagingColumnSortable(
  columns: readonly ShortageCoverageStagingGridColumn[],
  key: string,
): key is ShortageCoverageStagingGridColumnKey {
  return columns.some((c) => c.key === key && shortageCoverageStagingSortFactFor(c) !== null);
}

export function shortageCoverageStagingGridTemplate(
  columns: readonly ShortageCoverageStagingGridColumn[] = SHORTAGE_COVERAGE_STAGING_SHEET_COLUMNS,
): string {
  return gridTemplate(columns);
}

export function shortageCoverageStagingGridFrozenLeft(
  columns: readonly ShortageCoverageStagingGridColumn[],
  key: ShortageCoverageStagingGridColumnKey,
): string {
  return gridFrozenLeft(columns, key);
}

export function defaultDirForShortageCoverageStagingColumn(
  columns: readonly ShortageCoverageStagingGridColumn[],
  key: string,
): GridSortDir {
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'number' ? 'desc' : 'asc';
}

export {
  LEDGER_GRID_FROZEN_CELL as SHORTAGE_COVERAGE_STAGING_GRID_FROZEN_CELL,
  ledgerGridCell as shortageCoverageStagingGridCell,
  ledgerGridRowShellClass as shortageCoverageStagingGridRowShellClass,
} from '@/design-system/components/grid/grid-cell-chrome';
