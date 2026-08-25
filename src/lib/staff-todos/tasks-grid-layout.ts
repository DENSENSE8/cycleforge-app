/**
 * My Tasks (`staff_todos`) — the column model for the Tasks workbench grid.
 *
 * The personal task list existed only as a hand-rolled `<div>` list inside a
 * 290px header popover. It is a **collection** — rows with a name, a kind, a
 * state, a station and a clock — so it reads as a LedgerGrid like every other
 * operator collection, through the table definition registry.
 *
 * Sibling of `daily-grid-layout.ts`, not a merge with it: Daily is the ORG's
 * shift checklist with a roster behind each row (`daily_check_items` +
 * `daily_check_marks`), this is one staffer's own list (`staff_todos`). Two
 * stores, two questions, two tables — the shared thing is the engine.
 *
 * Facts are content-hard and trailing `_fill` owns the sole `1fr`, from the one
 * declaration (`GRID_FILL_COLUMN`). Nothing here re-derives geometry.
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import { GRID_FILL_COLUMN } from '@/design-system/components/grid';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type TasksGridColumnKey =
  | 'select'
  | 'task'
  | 'status'
  | 'kind'
  | 'station'
  | 'due'
  | 'updated'
  /** Compound (two-row) presentation tracks — see {@link TASKS_COMPOUND_COLUMNS}. */
  | 'thumb'
  | 'item'
  | 'fulfillment'
  | 'state'
  | 'amount'
  | 'actions'
  | '_fill';

export interface TasksGridColumn {
  key: TasksGridColumnKey;
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
 * Canonical Tasks columns, in scan order.
 *
 * `select` carries the surface's primary VERB — ticking the box checks the task
 * off — exactly as it does on Daily, which is why the capability bag below
 * declares `multiSelect: false` rather than mounting select-all over it.
 *
 * `due` is the recurring cycle's next reset, and reads `—` for a general task.
 * A recurring task has no deadline; it has a period, and the honest column says
 * when the period turns over rather than inventing a date.
 */
export const TASKS_GRID_COLUMNS: readonly TasksGridColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', sortable: false, frozen: true },
  {
    key: 'task',
    frozen: true,
    // Content-hard, never `1fr` — a flex track inside the FROZEN pane puts every
    // following frozen cell's sticky `left` out by the difference.
    width: 'minmax(20rem, 20rem)',
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
    key: 'kind',
    width: 'minmax(6.5rem, 6.5rem)',
    label: 'Kind',
    type: 'tag',
    hideKey: 'kind',
    labelFitRem: 4.5,
  },
  {
    key: 'station',
    width: 'minmax(6rem, 6rem)',
    label: 'Station',
    type: 'text',
    hideKey: 'station',
    labelFitRem: 5,
  },
  {
    key: 'due',
    width: 'minmax(7rem, 7rem)',
    label: 'Resets',
    type: 'date',
    hideKey: 'due',
    tier: 'optional',
    labelFitRem: 4.5,
  },
  {
    key: 'updated',
    width: 'minmax(7rem, 7rem)',
    label: 'Checked',
    type: 'date',
    hideKey: 'updated',
    tier: 'optional',
    labelFitRem: 4.5,
  },
  GRID_FILL_COLUMN,
] as const;

/**
 * COMPOUND (two-row) Tasks columns.
 *
 * The SAME tracks Receiving, Orders and Incoming mount — derived from
 * `COMPOUND_TRACKS`, not copied. This line only narrows the key type.
 *
 * **Tasks joining this layout is the test of the seam.** Every other compound
 * family is a warehouse line with a photo, an order and a carrier; a personal
 * to-do has none of those. It still mounts the identical model, and the empty
 * `fulfillment` track reads as two dashes — because a personal task genuinely
 * has no order and no tracking number. That is a DATA difference, which the
 * shared layout is supposed to show. Hiding the track for this one family, or
 * giving Tasks a shorter array, would be a LAYOUT difference, which it is not.
 *
 * The `select` gutter keeps its meaning: on Tasks the checkbox is the surface's
 * primary VERB (it checks the task off), not a selection. The compound model
 * governs the geometry of that track, never what clicking it does.
 */
export const TASKS_COMPOUND_COLUMNS: readonly TasksGridColumn[] =
  compoundColumnsFor<TasksGridColumn>();


/** Data columns that support click-to-sort (`_fill` carries `sortable: false`). */
const TASKS_GRID_SORTABLE_KEYS: readonly TasksGridColumnKey[] = TASKS_GRID_COLUMNS.filter(
  (c) => c.sortable !== false && c.key !== 'select',
).map((c) => c.key);

export function isTasksGridSortable(key: string): key is TasksGridColumnKey {
  return (TASKS_GRID_SORTABLE_KEYS as readonly string[]).includes(key);
}




/** Recency opens newest-first; everything else ascends. */
export function defaultDirForTasksGridSort(key: TasksGridColumnKey): GridSortDir {
  return key === 'updated' || key === 'due' ? 'desc' : 'asc';
}

/**
 * The per-family geometry aliases were DELETED (2026-08-22).
 *
 * `isTasksGridFrozen`, `tasksGridTemplate`, `tasksGridFrozenLeft` and the
 * `TASKS_GRID_FROZEN_CELL` / `tasksGridCell` / `tasksGridRowShellClass`
 * re-exports were each a family-flavoured name for a shared implementation
 * (`gridFrozenLeft`, `gridTemplate`, `ledgerGridCell`, …). Six families did the
 * same rename, which is a fork whether or not the bodies agree today: it is not
 * a decision, it is six places for the next fix to miss.
 *
 * Their consumers are gone — the row is `CompoundRow` and the header derives
 * freeze, offsets and template from the MOUNTED column model — so the aliases
 * went with them rather than standing as dead API.
 */
