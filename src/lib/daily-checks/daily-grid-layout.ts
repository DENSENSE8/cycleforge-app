/**
 * Home → Daily task table — the column model.
 *
 * Daily was a Reminders-shaped list on a white sheet; it is now a LedgerGrid
 * like every other operator collection, so the shift checklist reads as ROWS
 * with a name, a status and a team column instead of prose bullets.
 *
 * Facts are content-hard and trailing `_fill` owns the sole `1fr` — the
 * Receiving/Orders law, from the one declaration (`GRID_FILL_COLUMN`). Nothing
 * here re-derives geometry: track sums, sticky offsets and the header's
 * text-vs-glyph answer all come from the shared helpers.
 */

import { GRID_FILL_COLUMN } from '@/lib/grid/grid-fill-column';
import { gridFrozenKeys } from '@/lib/grid/grid-column-editability';
import {
  gridFrozenLeft,
  gridTemplate,
} from '@/lib/grid/grid-column-geometry';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/lib/grid/grid-sort-dir';

export type DailyGridColumnKey =
  | 'select'
  | 'task'
  | 'status'
  | 'team'
  | 'marked'
  | '_fill';

export interface DailyGridColumn {
  key: DailyGridColumnKey;
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

/**
 * Canonical Daily columns, in scan order.
 *
 * `select` is not decoration here — ticking the box IS the daily action, so the
 * gutter carries the surface's primary verb rather than a selection it would
 * otherwise have no use for.
 *
 * `team` is the roster denominator (`3/5`), the one fact a checklist row cannot
 * answer on its own: whether *I* did it is `status`, whether the SHIFT did it
 * is a different question and gets a different track.
 */
export const DAILY_GRID_COLUMNS: readonly DailyGridColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', sortable: false, frozen: true },
  {
    key: 'task',
    frozen: true,
    // Content-hard, never `1fr` — a flex track inside the FROZEN pane puts every
    // following frozen cell's sticky `left` out by the difference.
    width: 'minmax(18rem, 18rem)',
    label: 'Task',
    type: 'text',
    resizable: true,
    labelFitRem: 8,
  },
  {
    key: 'status',
    width: 'minmax(6rem, 6rem)',
    label: 'Status',
    type: 'tag',
    hideKey: 'status',
    labelFitRem: 4.5,
  },
  {
    key: 'team',
    width: 'minmax(5rem, 5rem)',
    label: 'Team',
    type: 'number',
    align: 'end',
    hideKey: 'team',
    labelFitRem: 4.5,
  },
  {
    key: 'marked',
    width: 'minmax(6.5rem, 6.5rem)',
    label: 'Checked',
    type: 'date',
    hideKey: 'marked',
    tier: 'optional',
    labelFitRem: 4.5,
  },
  GRID_FILL_COLUMN,
] as const;

/** Frozen identity pane — `select · task`, derived from the model's own flag. */
const DAILY_GRID_LOCKED_KEYS = gridFrozenKeys(DAILY_GRID_COLUMNS);

/** Data columns that support click-to-sort (`_fill` carries `sortable: false`). */
const DAILY_GRID_SORTABLE_KEYS: readonly DailyGridColumnKey[] = DAILY_GRID_COLUMNS.filter(
  (c) => c.sortable !== false && c.key !== 'select',
).map((c) => c.key);

export function isDailyGridSortable(key: string): key is DailyGridColumnKey {
  return (DAILY_GRID_SORTABLE_KEYS as readonly string[]).includes(key);
}

export function isDailyGridFrozen(key: string): boolean {
  return (DAILY_GRID_LOCKED_KEYS as readonly string[]).includes(key);
}

export function dailyGridTemplate(
  columns: readonly DailyGridColumn[] = DAILY_GRID_COLUMNS,
): string {
  return gridTemplate(columns);
}

export function dailyGridFrozenLeft(key: string): string {
  return gridFrozenLeft(DAILY_GRID_COLUMNS, key as DailyGridColumnKey);
}

/** Recency opens newest-first; everything else ascends. */
export function defaultDirForDailyGridSort(key: DailyGridColumnKey): GridSortDir {
  return key === 'marked' ? 'desc' : 'asc';
}

export {
  LEDGER_GRID_FROZEN_CELL as DAILY_GRID_FROZEN_CELL,
  ledgerGridCell as dailyGridCell,
  ledgerGridRowShellClass as dailyGridRowShellClass,
} from '@/lib/grid/grid-cell-chrome';
