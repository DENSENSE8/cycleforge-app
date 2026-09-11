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
import { TASKS_FIELD_CATALOG, TASKS_PRODUCT_LAYOUT } from '@/lib/tables/field-catalog/tasks';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
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
  | 'dates'
  | 'state'
  | 'actions'
  | '_fill'
  /** Materialized slot tracks — keys are slot indices, never field ids. */
  | `status:${number}`
  | `subtitle:${number}`;

export interface TasksGridColumn extends SlotTrackFields {
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
export function tasksCompoundColumnsFor(layout: SlotLayout): readonly TasksGridColumn[] {
  return materializeTracks<TasksGridColumn>({
    layout,
    catalog: TASKS_FIELD_CATALOG,
    base: compoundColumnsFor<TasksGridColumn>(),
  });
}

/**
 * The PRODUCT-DEFAULT materialization — what an org with no override mounts.
 * With the product layout's empty band that is the shared `COMPOUND_TRACKS`
 * verbatim, so the port reproduces the workbench exactly and every catalog fact
 * becomes bindable without a deploy.
 */
export const TASKS_COMPOUND_COLUMNS: readonly TasksGridColumn[] =
  tasksCompoundColumnsFor(TASKS_PRODUCT_LAYOUT);


/**
 * The `?colsort=` vocabulary — declared here, not derived from a column model.
 *
 * Same shape and the same reason as `queue-display-sort`'s
 * `COMPOUND_TRACK_SORT_KEYS`: To-Ship shipped this exact bug once already —
 * the mount moved to the compound tracks, the sort vocabulary did not, and
 * clicking a header silently did nothing. Wave 1.3 moved Tasks onto the same
 * tracks and left `TASKS_GRID_SORTABLE_KEYS` deriving from the flat array.
 *
 * The WORDS stay local (rather than emitting track keys into the URL) for the
 * `repair-display-sort` reason: a bookmarked `?colsort=updated` must keep
 * meaning `updated` after a rebind moves that fact to another slot index.
 */
export type TasksSortFact = 'task' | 'status' | 'kind' | 'station' | 'due' | 'updated' | 'order';

const TASKS_SORT_FACTS: readonly TasksSortFact[] = [
  'task', 'status', 'kind', 'station', 'due', 'updated', 'order',
];

/**
 * Compound track → the fact it carries. `item` holds the task text, `state`
 * holds the done/archived pill. `fulfillment` and `amount` stay absent: a
 * staffer's task has no order and no price, and a header that sorts by nothing
 * is worse than one that never offered.
 */
const TASKS_TRACK_SORT_FACTS: Readonly<Record<string, TasksSortFact>> = {
  dates: 'due',
  item: 'task',
  state: 'status',
  fulfillment: 'order',
};

/**
 * Bound catalog field → the fact it sorts by. Slot tracks are keyed `status:N`,
 * so the bound FIELD is what makes the header clickable — binding Station into
 * `status:3` must still sort as `station`.
 */
const TASKS_SLOT_SORT_FACTS: Readonly<Record<string, TasksSortFact>> = {
  'tasks.task': 'task',
  'tasks.status': 'status',
  'tasks.kind': 'kind',
  'tasks.station': 'station',
  'tasks.resets': 'due',
  'tasks.checked': 'updated',
};

/** The `?colsort=` word a mounted track drives, or null when it does not sort. */
export function tasksSortFactFor(
  col: Pick<TasksGridColumn, 'key' | 'sortable' | 'fieldId'>,
): TasksSortFact | null {
  if (col.sortable === false || col.key === 'select') return null;
  const slot = col.fieldId ? TASKS_SLOT_SORT_FACTS[col.fieldId] : undefined;
  if (slot) return slot;
  return TASKS_TRACK_SORT_FACTS[col.key] ?? null;
}

export function isTasksSortFact(raw: string): raw is TasksSortFact {
  return (TASKS_SORT_FACTS as readonly string[]).includes(raw);
}

/** Header keys that sort — the descriptor's `isSortable` for this family. */
export function isTasksGridSortable(
  columns: readonly TasksGridColumn[],
  key: string,
): boolean {
  const col = columns.find((c) => c.key === key);
  return col ? tasksSortFactFor(col) != null : false;
}

/** The mounted track a `?colsort=` word points at — the header's active mark. */
export function tasksColumnKeyForSort(
  columns: readonly TasksGridColumn[],
  fact: TasksSortFact | null,
): TasksGridColumnKey | null {
  if (!fact) return null;
  return columns.find((c) => tasksSortFactFor(c) === fact)?.key ?? null;
}

/**
 * The comparator shape each fact sorts under. On the FACT rather than read off
 * a column: it used to be `TASKS_GRID_COLUMNS.find(...)?.type`, which returned
 * `undefined` for every compound track.
 */
export const TASKS_SORT_FACT_TYPES: Readonly<Record<TasksSortFact, ColumnType>> = {
  task: 'text',
  status: 'tag',
  kind: 'tag',
  station: 'text',
  due: 'date',
  updated: 'date',
  order: 'text',
};

/**
 * Recency opens newest-first; everything else ascends. Keyed on the FACT so a
 * rebind carries the rule instead of leaving it on a slot index.
 */
export function defaultDirForTasksGridSort(fact: TasksSortFact): GridSortDir {
  return fact === 'updated' || fact === 'due' ? 'desc' : 'asc';
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
