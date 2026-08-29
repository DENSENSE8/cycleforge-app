/**
 * Inventory › Units spreadsheet column model.
 *
 * A row is one serialized unit — the browse/collection map for `/inventory`
 * (the units collection the ops-queue golden mounts). Columns: Serial ·
 * Product · Status · Condition · Location · Updated — over the SAME shared
 * geometry every other house spreadsheet uses (sibling of `warehouse.bins`).
 *
 * Frozen pane = `serial` (the unit's own scannable handle). Browse-only —
 * no live multi-select gutter yet (that arrives with bulk unit actions), so
 * there is no `select` column and the pane is the single identity track.
 */

import { gridFrozenKeys } from '@/design-system/components/grid/grid-column-editability';
import {
  gridFrozenLeft,
  gridTemplate,
} from '@/design-system/components/grid/grid-column-geometry';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type UnitsGridColumnKey =
  | 'serial'
  | 'product'
  | 'status'
  | 'condition'
  | 'location'
  | 'updated';

export interface UnitsGridColumn {
  key: UnitsGridColumnKey;
  width: string;
  label?: string;
  gridLabel?: string;
  labelFitRem?: number;
  type?: ColumnType;
  /** Justification override — see {@link LedgerGridColumnModel.align}. */
  align?: 'start' | 'end';
  /** Part of the frozen identity pane — see {@link LedgerGridColumnModel.frozen}. */
  frozen?: boolean;
  /** Staff-preference key (`staff_preferences.tableColumns.inventory_units`). */
  hideKey?: string;
  /** `core` ships ON (opt-out); `optional` ships OFF (opt-in via Fields). */
  tier?: 'core' | 'optional';
  /** When false, header is not click-to-sort. */
  sortable?: boolean;
}

/**
 * Canonical units columns. Only `product` flexes; facts are content-hard.
 *
 * DEFAULT VIEW is the full set — every track answers a question the operator
 * asks while scanning the unit map (which serial, what item, what lifecycle
 * state, what grade, where it sits, when it last moved).
 */
export const UNITS_GRID_COLUMNS: readonly UnitsGridColumn[] = [
  {
    key: 'serial',
    frozen: true,
    width: 'minmax(9rem, 9rem)',
    label: 'Serial',
    gridLabel: 'Serial',
    type: 'id',
    labelFitRem: 4,
  },
  {
    key: 'product',
    width: 'minmax(12rem, 1fr)',
    label: 'Product',
    gridLabel: 'Product',
    type: 'text',
    labelFitRem: 5,
  },
  {
    key: 'status',
    width: 'minmax(8rem, 8rem)',
    label: 'Status',
    type: 'tag',
    hideKey: 'status',
    // Lifecycle chip — a categorical label, not a magnitude scanned down.
    sortable: true,
    labelFitRem: 4,
  },
  {
    key: 'condition',
    width: 'minmax(6rem, 6rem)',
    label: 'Condition',
    gridLabel: 'Cond',
    type: 'tag',
    hideKey: 'condition',
    labelFitRem: 4,
  },
  {
    key: 'location',
    width: 'minmax(8rem, 8rem)',
    label: 'Location',
    type: 'location',
    hideKey: 'location',
    labelFitRem: 5,
  },
  {
    key: 'updated',
    width: 'minmax(5.5rem, 5.5rem)',
    label: 'Updated',
    type: 'date',
    hideKey: 'updated',
    labelFitRem: 4.5,
  },
] as const;

/** Frozen identity pane — `serial`, derived from the model's own flag. */
const UNITS_GRID_LOCKED_KEYS: readonly UnitsGridColumnKey[] = gridFrozenKeys(UNITS_GRID_COLUMNS);

const UNITS_GRID_SORTABLE_KEYS: readonly UnitsGridColumnKey[] = UNITS_GRID_COLUMNS.filter(
  (c) => c.sortable !== false,
).map((c) => c.key);

export function isUnitsGridSortable(key: string): key is UnitsGridColumnKey {
  return (UNITS_GRID_SORTABLE_KEYS as readonly string[]).includes(key);
}

export function isUnitsGridFrozen(key: string): boolean {
  return UNITS_GRID_LOCKED_KEYS.includes(key as UnitsGridColumnKey);
}

/** CSS grid template — one `var(--cf-col-<key>, <width>)` track per column. */
export function unitsGridTemplate(
  columns: readonly UnitsGridColumn[] = UNITS_GRID_COLUMNS,
): string {
  return gridTemplate(columns);
}

/** Sticky offset for a frozen cell — row px + widths of the locked columns before it. */
export function unitsGridFrozenLeft(key: UnitsGridColumnKey): string {
  return gridFrozenLeft(UNITS_GRID_COLUMNS, key);
}

/** Default direction on first activation — updated newest-first; everything else A→Z. */
export function defaultDirForUnitsGridSort(key: UnitsGridColumnKey): GridSortDir {
  if (key === 'updated') return 'desc';
  return 'asc';
}

// Shared spreadsheet chrome — @/design-system/components/grid ledgerGridCell.
export {
  LEDGER_GRID_FROZEN_CELL as UNITS_GRID_FROZEN_CELL,
  ledgerGridCell as unitsGridCell,
  ledgerGridRowShellClass as unitsGridRowShellClass,
} from '@/design-system/components/grid/grid-cell-chrome';
