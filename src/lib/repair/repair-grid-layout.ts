/** Repair queue spreadsheet column model — SoT for the `/repair` LedgerGrid. */

import {
  REPAIR_FIELD_CATALOG,
  REPAIR_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/repair';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import {
  defaultDirForRepairDisplaySort,
  type RepairDisplaySortColumn,
} from '@/lib/repair/repair-display-sort';
import {
  gridFrozenLeft,
  gridTemplate,
} from '@/design-system/components/grid/grid-column-geometry';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type RepairGridColumnKey =
  | 'select'
  | 'title'
  /** Materialized slot tracks — keys are slot indices, never field ids. */
  | `status:${number}`
  | `subtitle:${number}`;

export interface RepairGridColumn extends SlotTrackFields {
  key: RepairGridColumnKey;
  width: string;
  label?: string;
  gridLabel?: string;
  labelFitRem?: number;
  type?: ColumnType;
  /** Justification override — see {@link LedgerGridColumnModel.align}. */
  align?: 'start' | 'end';
  /** Part of the frozen identity pane — see {@link LedgerGridColumnModel.frozen}. */
  frozen?: boolean;
  /** Staff-preference key (`staff_preferences.tableColumns.repair`). */
  hideKey?: string;
  /** `core` ships ON (opt-out); `optional` ships OFF (opt-in via Fields). */
  tier?: 'core' | 'optional';
  /** When false, the header is not click-to-sort (select gutter only). */
  sortable?: boolean;
}

/**
 * The structural sheet skeleton — what Repair paints with ZERO bindings.
 * `title` is the only flex track; the frozen pane is `select · title`.
 */
const REPAIR_SHEET_BASE: readonly RepairGridColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', sortable: false, frozen: true },
  {
    key: 'title',
    frozen: true,
    width: 'minmax(12rem, 1fr)',
    label: 'Product',
    gridLabel: 'Product',
    type: 'text',
    labelFitRem: 8,
  },
];

/**
 * Materialize the mounted repair columns from an effective layout. Both bands
 * anchor on `title`, so the default plate reads created · customer · ticket —
 * the retired hand model's core view.
 */
export function repairSheetColumnsFor(layout: SlotLayout): readonly RepairGridColumn[] {
  return materializeTracks<RepairGridColumn>({
    layout,
    catalog: REPAIR_FIELD_CATALOG,
    base: REPAIR_SHEET_BASE,
    statusAnchorKey: 'title',
    subtitleAnchorKey: 'title',
  });
}

/**
 * The PRODUCT-DEFAULT materialization — what an org with no override mounts,
 * the canonical columns of the repair binding, and the guard SoT.
 */
export const REPAIR_SHEET_COLUMNS: readonly RepairGridColumn[] =
  repairSheetColumnsFor(REPAIR_PRODUCT_LAYOUT);

/** Bound field → the queue's URL SORT WORD. */
const REPAIR_SORT_WORD_BY_FIELD: Readonly<Record<string, RepairDisplaySortColumn>> = {
  'repair.created': 'date',
  'repair.customer': 'customer',
  'repair.phone': 'phone',
  'repair.price': 'price',
  'repair.order': 'order',
  'repair.ticket': 'ticket',
};

/** The URL sort word a column sorts by, or null when it offers no sort. */
export function repairSortFactFor(col: RepairGridColumn): RepairDisplaySortColumn | null {
  if (col.sortable === false || col.key === 'select') return null;
  if (col.key === 'title') return 'title';
  return col.fieldId ? (REPAIR_SORT_WORD_BY_FIELD[col.fieldId] ?? null) : null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isRepairColumnSortable(
  columns: readonly RepairGridColumn[],
  key: string,
): key is RepairGridColumnKey {
  return columns.some((c) => c.key === key && repairSortFactFor(c) !== null);
}

/** The mounted track carrying a URL sort word, so `?sort=` lights a header. */
export function repairColumnKeyForSort(
  columns: readonly RepairGridColumn[],
  sort: RepairDisplaySortColumn | null,
): RepairGridColumnKey | null {
  if (!sort) return null;
  return columns.find((c) => repairSortFactFor(c) === sort)?.key ?? null;
}

export function repairGridTemplate(
  columns: readonly RepairGridColumn[] = REPAIR_SHEET_COLUMNS,
): string {
  return gridTemplate(columns);
}

/** Sticky offset for a frozen cell, derived from the MOUNTED model. */
export function repairGridFrozenLeft(
  columns: readonly RepairGridColumn[],
  key: string,
): string {
  return gridFrozenLeft(columns, key);
}

/**
 * Default direction when a column sort is first activated — the created date
 * scans newest-first; everything else A→Z / low→high.
 */
export function defaultDirForRepairColumn(
  columns: readonly RepairGridColumn[],
  key: string,
): GridSortDir {
  const col = columns.find((c) => c.key === key);
  const word = col ? repairSortFactFor(col) : null;
  // Defer to the URL vocabulary's own answer so a header click and a dropdown
  // pick open the same way — that shared `?sort=` state is the whole point.
  return word ? (defaultDirForRepairDisplaySort(word) ?? 'asc') : 'asc';
}

/* Field-source helpers (display ↔ sort SoT) moved to the resolver leaf with the wave 1.4 slot port: */
export {
  repairCreatedAtSource,
  repairCustomerName,
  repairCustomerPhone,
  repairOrderValue,
  repairPhoneDisplay,
  repairPriceDisplay,
  repairPriceSortValue,
  repairTicketValue,
} from '@/lib/tables/field-catalog/repair-resolve';

// Shared spreadsheet chrome — @/design-system/components/grid ledgerGridCell.
export {
  LEDGER_GRID_FROZEN_CELL as REPAIR_GRID_FROZEN_CELL,
  ledgerGridCell as repairGridCell,
  ledgerGridRowShellClass as repairGridRowShellClass,
} from '@/design-system/components/grid/grid-cell-chrome';
