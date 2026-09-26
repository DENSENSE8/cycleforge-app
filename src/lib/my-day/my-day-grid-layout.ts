/** My Day spreadsheet column model — the Today-native sibling of {@link RECEIVING_GRID_COLUMNS}. */

import {
  gridFrozenLeft,
  gridTemplate,
} from '@/design-system/components/grid/grid-column-geometry';
import {
  MY_DAY_FIELD_CATALOG,
  MY_DAY_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/my-day';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { ColumnType, TableId } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

/** Today's per-staff column-prefs bucket + Fields-menu vocabulary key. */
export const MY_DAY_TABLE_ID: TableId = 'my-day';

export type MyDayGridColumnKey =
  | 'select'
  | 'task'
  /** Materialized slot tracks — keys are slot indices, never field ids. */
  | `status:${number}`
  | `subtitle:${number}`;

export interface MyDayGridColumn extends SlotTrackFields {
  key: MyDayGridColumnKey;
  width: string;
  label?: string;
  gridLabel?: string;
  labelFitRem?: number;
  type?: ColumnType;
  /** Justification override — see {@link LedgerGridColumnModel.align}. */
  align?: 'start' | 'end';
  /** Part of the frozen identity pane — see {@link LedgerGridColumnModel.frozen}. */
  frozen?: boolean;
  /** When false, the header is not click-to-sort (select gutter only). */
  sortable?: boolean;
  /** Per-staff pref key for the Fields menu (`TABLE_COLUMNS.my-day`). */
  hideKey?: string;
  /** `optional` ships hidden and is opted into from Fields; `core` ships on. */
  tier?: 'core' | 'optional';
}

/**
 * The structural sheet skeleton — what Today paints with ZERO bindings.
 * `task` is the only flex track; the frozen pane is `select · task`, which
 * carries no `hideKey`: the Fields menu can never take a row's identity away.
 */
const MY_DAY_SHEET_BASE: readonly MyDayGridColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', sortable: false, frozen: true },
  {
    key: 'task',
    frozen: true,
    width: 'minmax(14rem, 1fr)',
    label: 'Task',
    gridLabel: 'Task',
    type: 'text',
    labelFitRem: 8,
  },
];

/**
 * Materialize the mounted Today columns from an effective layout. Both bands
 * anchor on `task`, so the default plate reads lane · record · due — the
 * retired hand model's core view.
 */
export function myDaySheetColumnsFor(layout: SlotLayout): readonly MyDayGridColumn[] {
  return materializeTracks<MyDayGridColumn>({
    layout,
    catalog: MY_DAY_FIELD_CATALOG,
    base: MY_DAY_SHEET_BASE,
    statusAnchorKey: 'task',
    subtitleAnchorKey: 'task',
  });
}

/**
 * The PRODUCT-DEFAULT materialization — what an org with no override mounts,
 * the canonical columns of the Today binding, and the guard SoT.
 */
export const MY_DAY_SHEET_COLUMNS: readonly MyDayGridColumn[] =
  myDaySheetColumnsFor(MY_DAY_PRODUCT_LAYOUT);

/** The FACT a column sorts by, or null when it offers no sort. */
export function myDaySortFactFor(col: MyDayGridColumn): string | null {
  if (col.sortable === false || col.key === 'select') return null;
  if (col.key === 'task') return 'task';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isMyDayColumnSortable(
  columns: readonly MyDayGridColumn[],
  key: string,
): key is MyDayGridColumnKey {
  return columns.some((c) => c.key === key && myDaySortFactFor(c) !== null);
}

/** CSS grid template — one `var(--cf-col-<key>, <width>)` track per column. */
export function myDayGridTemplate(
  columns: readonly MyDayGridColumn[] = MY_DAY_SHEET_COLUMNS,
): string {
  return gridTemplate(columns);
}

/** Sticky offset for a frozen cell, derived from the MOUNTED model. */
export function myDayGridFrozenLeft(
  columns: readonly MyDayGridColumn[],
  key: MyDayGridColumnKey,
): string {
  return gridFrozenLeft(columns, key);
}

/**
 * First-activation direction — recency/urgency columns open most-urgent-first.
 */
export function defaultDirForMyDayColumn(
  columns: readonly MyDayGridColumn[],
  key: string,
): GridSortDir {
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}

// Shared spreadsheet chrome — @/design-system/components/grid ledgerGridCell.
export {
  LEDGER_GRID_FROZEN_CELL as MY_DAY_GRID_FROZEN_CELL,
  ledgerGridCell as myDayGridCell,
  ledgerGridRowShellClass as myDayGridRowShellClass,
} from '@/design-system/components/grid/grid-cell-chrome';
