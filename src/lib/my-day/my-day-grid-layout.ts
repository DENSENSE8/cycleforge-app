/**
 * My Day spreadsheet column model — the Today-native sibling of
 * {@link PICKUP_GRID_COLUMNS} / {@link RECEIVING_GRID_COLUMNS}.
 *
 * Composes the SAME shared geometry as every other station/workbench grid
 * (`ledgerGridCell` · `LEDGER_GRID_FROZEN_CELL`), so
 * a Today row lines up track-for-track with Pending, Unbox and Incoming rather
 * than being a second table language on the operator's first screen.
 *
 * Frozen pane = `select` (empty gutter — Today is browse-and-open, not bulk) +
 * `task` (the flexing identity cell). Task is identity, so it is never in-cell
 * editable; correction happens at the record plane the row opens.
 */

import { gridFrozenKeys } from '@/design-system/components/grid/grid-column-editability';
import {
  gridFrozenLeft,
  gridTemplate,
} from '@/design-system/components/grid/grid-column-geometry';
import type { ColumnType, TableId } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

/**
 * Today's per-staff column-prefs bucket + Fields-menu vocabulary key. Named once
 * so the grid's `useGridColumnVisibility` and the column-display rail
 * cannot drift onto two different buckets — that split is invisible until a
 * staffer's toggle stops sticking.
 */
export const MY_DAY_TABLE_ID: TableId = 'my-day';

export type MyDayGridColumnKey =
  | 'select'
  | 'task'
  | 'lane'
  | 'queue'
  | 'record'
  | 'due'
  | 'status';

export interface MyDayGridColumn {
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
 * Canonical Today columns. Only `task` flexes; facts are content-hard.
 *
 * **DEFAULT VIEW (tier `core`) is `select · task · lane · record · due`** — the
 * four questions a personal task row has to answer without a click: what it is,
 * which band of the day it belongs to, which record it points at, and when it is
 * due. Grids open lean and staff opt the rest in (`source-of-truth.md` → Grid
 * column visibility).
 *
 * `queue` and `status` ship `optional` for reasons, not to hit a number:
 *  - `queue` is the coarse category ("Orders" / "Testing" / "Support") of a
 *    record the `record` track already names precisely, so on a narrow viewport
 *    it is the track that costs most and says least.
 *  - `status` is **null on every interrupt** — only work orders carry a
 *    lifecycle — so on an interrupt-heavy day it is a half-empty ruled band.
 *
 * `select` and `task` are frozen, so they carry NO `hideKey` and no `tier`: the
 * Fields menu can never take a row's identity away (`isGridColumnVisible` rule 1).
 */
export const MY_DAY_GRID_COLUMNS: readonly MyDayGridColumn[] = [
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
  {
    key: 'lane',
    width: 'minmax(6.5rem, 6.5rem)',
    label: 'Lane',
    type: 'tag',
    hideKey: 'lane',
    labelFitRem: 4.5,
  },
  {
    key: 'queue',
    width: 'minmax(6.5rem, 6.5rem)',
    label: 'Queue',
    type: 'tag',
    hideKey: 'queue',
    tier: 'optional',
    labelFitRem: 4.5,
  },
  {
    key: 'record',
    width: 'minmax(8rem, 8rem)',
    label: 'Record',
    type: 'id',
    hideKey: 'record',
    labelFitRem: 4.5,
  },
  {
    key: 'due',
    width: 'minmax(5.5rem, 5.5rem)',
    label: 'Due',
    type: 'date',
    hideKey: 'due',
    labelFitRem: 4.5,
  },
  {
    key: 'status',
    width: 'minmax(6rem, 6rem)',
    label: 'Status',
    type: 'tag',
    hideKey: 'status',
    tier: 'optional',
    labelFitRem: 4.5,
  },
] as const;

/**
 * Frozen identity pane — `select · task`, derived from the model's own `frozen`
 * flag (one declaration for freeze + immovability + sticky-offset math).
 */
const MY_DAY_GRID_LOCKED_KEYS: readonly MyDayGridColumnKey[] = gridFrozenKeys(MY_DAY_GRID_COLUMNS);

const MY_DAY_GRID_SORTABLE_KEYS: readonly MyDayGridColumnKey[] = MY_DAY_GRID_COLUMNS.filter(
  (c) => c.sortable !== false && c.key !== 'select',
).map((c) => c.key);

export function isMyDayGridSortable(key: string): key is MyDayGridColumnKey {
  return (MY_DAY_GRID_SORTABLE_KEYS as readonly string[]).includes(key);
}

export function isMyDayGridFrozen(key: string): boolean {
  return MY_DAY_GRID_LOCKED_KEYS.includes(key as MyDayGridColumnKey);
}

/** CSS grid template — one `var(--cf-col-<key>, <width>)` track per column. */
export function myDayGridTemplate(
  columns: readonly MyDayGridColumn[] = MY_DAY_GRID_COLUMNS,
): string {
  return gridTemplate(columns);
}

/**
 * Sticky offset for a frozen cell — row px plus the summed widths of the locked
 * columns before it. Self-computed over {@link MY_DAY_GRID_COLUMNS} so Today's
 * own track widths drive the offset.
 */
export function myDayGridFrozenLeft(key: MyDayGridColumnKey): string {
  return gridFrozenLeft(MY_DAY_GRID_COLUMNS, key);
}


/** First-activation direction — recency/urgency columns open most-urgent-first. */
export function defaultDirForMyDayGridSort(key: MyDayGridColumnKey): GridSortDir {
  return key === 'due' ? 'desc' : 'asc';
}

// Shared spreadsheet chrome — @/design-system/components/grid ledgerGridCell.
export {
  LEDGER_GRID_FROZEN_CELL as MY_DAY_GRID_FROZEN_CELL,
  ledgerGridCell as myDayGridCell,
  ledgerGridRowShellClass as myDayGridRowShellClass,
} from '@/design-system/components/grid/grid-cell-chrome';
