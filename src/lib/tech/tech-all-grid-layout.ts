/** Tech All triage spreadsheet columns — MATERIALIZED from a {@link SlotLayout}, never a hand array. */

import {
  gridFrozenLeft,
  gridTemplate,
} from '@/design-system/components/grid/grid-column-geometry';
import {
  TECH_ALL_FIELD_CATALOG,
  TECH_ALL_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/tech-all';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import { SLOT_TABLE_ID_HEADER_WORD } from '@/lib/tables/slot-table-family';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { ColumnType, TableId } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

/** Staff-prefs + Fields vocabulary — one All triage grid, one bucket. */
export const TECH_ALL_TABLE_ID: TableId = 'tech-all';

export type TechAllGridColumnKey =
  | 'select'
  | 'identity'
  /** Materialized slot tracks — keys are slot indices, never field ids. */
  | `status:${number}`
  | `subtitle:${number}`;

export interface TechAllGridColumn extends SlotTrackFields {
  key: TechAllGridColumnKey;
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
}

/**
 * The structural sheet skeleton — what Tech-All paints with ZERO bindings.
 * Identity flexes; the frozen pane is `select · identity` (browse-and-open, no
 * bulk).
 */
const TECH_ALL_SHEET_BASE: readonly TechAllGridColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', sortable: false, frozen: true },
  {
    key: 'identity',
    frozen: true,
    width: 'minmax(12rem, 1fr)',
    // The word is the ENGINE's on every identity track, sheet or compound
    // (`slot-table-family.ts`). The FACT stays this family's
    // (`tech-all.item`), and the cell still paints title over its quiet line.
    label: SLOT_TABLE_ID_HEADER_WORD,
    gridLabel: SLOT_TABLE_ID_HEADER_WORD,
    type: 'text',
    labelFitRem: 8,
  },
];

/**
 * Materialize the mounted Tech-All columns from an effective layout. Both bands
 * anchor on `identity`, so the default plate reads type · stage · urgency —
 * the retired hand model's whole strip.
 */
export function techAllSheetColumnsFor(layout: SlotLayout): readonly TechAllGridColumn[] {
  return materializeTracks<TechAllGridColumn>({
    layout,
    catalog: TECH_ALL_FIELD_CATALOG,
    base: TECH_ALL_SHEET_BASE,
    statusAnchorKey: 'identity',
    subtitleAnchorKey: 'identity',
  });
}

/**
 * The PRODUCT-DEFAULT materialization — what an org with no override mounts,
 * the canonical columns of the Tech-All binding, and the guard SoT.
 */
export const TECH_ALL_SHEET_COLUMNS: readonly TechAllGridColumn[] =
  techAllSheetColumnsFor(TECH_ALL_PRODUCT_LAYOUT);

/** The FACT a column sorts by, or null when it offers no sort. */
export function techAllSortFactFor(col: TechAllGridColumn): string | null {
  if (col.sortable === false || col.key === 'select') return null;
  if (col.key === 'identity') return 'identity';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isTechAllColumnSortable(
  columns: readonly TechAllGridColumn[],
  key: string,
): key is TechAllGridColumnKey {
  return columns.some((c) => c.key === key && techAllSortFactFor(c) !== null);
}

export function techAllGridTemplate(
  columns: readonly TechAllGridColumn[] = TECH_ALL_SHEET_COLUMNS,
): string {
  return gridTemplate(columns);
}

/** Sticky offset for a frozen cell, derived from the MOUNTED model. */
export function techAllGridFrozenLeft(
  columns: readonly TechAllGridColumn[],
  key: TechAllGridColumnKey,
): string {
  return gridFrozenLeft(columns, key);
}

/** First-activation direction. */
export function defaultDirForTechAllColumn(
  columns: readonly TechAllGridColumn[],
  key: string,
): GridSortDir {
  const col = columns.find((c) => c.key === key);
  if (col?.fieldId === 'tech-all.urgency') return 'asc';
  const dt = col?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}

export {
  LEDGER_GRID_FROZEN_CELL as TECH_ALL_GRID_FROZEN_CELL,
  ledgerGridCell as techAllGridCell,
  ledgerGridRowShellClass as techAllGridRowShellClass,
} from '@/design-system/components/grid/grid-cell-chrome';
