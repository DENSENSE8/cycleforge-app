/**
 * Home → Daily task table — the column model.
 *
 * Callers: HomeDailyMode, daily-table-definition, daily-grid-descriptor,
 * slot-table-cohort / field-catalog daily tests. KEEP mount:
 * DAILY_COMPOUND_COLUMNS (dailyCompoundColumnsFor). Schema: DailyFieldCatalog /
 * SlotLayout. User: "Make that contract green… Allowed: … KEEP rows." Discover
 * DELETE id hand-grid-export:daily:DAILY_GRID_COLUMNS — remove unmounted flat.
 *
 * Daily was a Reminders-shaped list on a white sheet; it is now a LedgerGrid
 * like every other operator collection, so the shift checklist reads as ROWS
 * with a name, a status and a team column instead of prose bullets.
 *
 * Facts are content-hard and trailing `_fill` owns the sole `1fr` — the
 * Receiving/Orders law. Nothing here re-derives geometry: track sums, sticky
 * offsets and the header's text-vs-glyph answer all come from the shared
 * helpers.
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import { DAILY_FIELD_CATALOG, DAILY_PRODUCT_LAYOUT } from '@/lib/tables/field-catalog/daily';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

import type { ColumnType } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type DailyGridColumnKey =
  | 'select'
  | 'task'
  | 'status'
  | 'team'
  | 'marked'
  /** Compound (two-row) presentation tracks — see {@link DAILY_COMPOUND_COLUMNS}. */
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

export interface DailyGridColumn extends SlotTrackFields {
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
 * COMPOUND (two-row) Daily columns.
 *
 * The SAME tracks Receiving, Incoming, To-Ship and Tasks mount — derived from
 * `COMPOUND_TRACKS`, not copied. This line only narrows the key type.
 *
 * Daily is the second checklist on the layout (Tasks is the first), and it
 * keeps the same reading: the gutter is the surface's primary VERB — ticking it
 * marks the item done for the viewer — not a selection. The compound model
 * governs that track's geometry and its face; it has never governed what
 * clicking it does.
 */
export function dailyCompoundColumnsFor(layout: SlotLayout): readonly DailyGridColumn[] {
  return materializeTracks<DailyGridColumn>({
    layout,
    catalog: DAILY_FIELD_CATALOG,
    base: compoundColumnsFor<DailyGridColumn>(),
  });
}

/**
 * The PRODUCT-DEFAULT materialization — what an org with no override mounts.
 * With the product layout's empty band that is the shared `COMPOUND_TRACKS`
 * verbatim, so the port reproduces the shift board exactly and every catalog
 * fact becomes bindable without a deploy.
 */
export const DAILY_COMPOUND_COLUMNS: readonly DailyGridColumn[] =
  dailyCompoundColumnsFor(DAILY_PRODUCT_LAYOUT);


/**
 * The `?colsort=` vocabulary — declared here, not derived from a column model.
 *
 * Same shape and the same reason as `queue-display-sort`'s
 * `COMPOUND_TRACK_SORT_KEYS`, which exists because the To-Ship desk shipped
 * this exact bug: the mount moved to the compound tracks, nothing updated the
 * sort vocabulary, `isColumn` rejected every header key, and **clicking a
 * header silently did nothing**. Wave 1.3 moved Daily onto the same tracks and
 * left `DAILY_GRID_SORTABLE_KEYS` deriving from the flat array — so
 * `isDailyGridSortable('state')` was false and the shift board's headers went
 * dead the same way.
 *
 * Keeping the WORDS local (rather than emitting track keys into the URL) is the
 * `repair-display-sort` rule: a bookmarked `?colsort=marked` must keep meaning
 * `marked` after a rebind moves that fact to a different slot index.
 */
export type DailySortFact = 'task' | 'status' | 'team' | 'marked' | 'dates' | 'order';

/**
 * Compound track → the fact it carries.
 *
 * A compound track is a CONTAINER for facts the flat model already sorted by:
 * `item` carries the checklist title (`task`), `state` carries the done pill
 * (`status`). `fulfillment` and `amount` are absent because a shift-checklist
 * row has neither an order nor a price — the compound adapter sets them null on
 * purpose, and a header that sorts by nothing is worse than one that does not
 * offer to.
 */
const DAILY_TRACK_SORT_FACTS: Readonly<Record<string, DailySortFact>> = {
  dates: 'dates',
  item: 'task',
  state: 'status',
  fulfillment: 'order',
};

/**
 * Bound catalog field → the fact it sorts by. Slot tracks are keyed `status:N`,
 * so the bound FIELD is what makes the header clickable — binding Team into
 * `status:2` must still sort as `team`.
 */
const DAILY_SLOT_SORT_FACTS: Readonly<Record<string, DailySortFact>> = {
  'daily.status': 'status',
  'daily.team': 'team',
  'daily.marked': 'marked',
};

/** The `?colsort=` word a mounted track drives, or null when it does not sort. */
export function dailySortFactFor(
  col: Pick<DailyGridColumn, 'key' | 'sortable' | 'fieldId'>,
): DailySortFact | null {
  if (col.sortable === false || col.key === 'select') return null;
  const slot = col.fieldId ? DAILY_SLOT_SORT_FACTS[col.fieldId] : undefined;
  if (slot) return slot;
  return DAILY_TRACK_SORT_FACTS[col.key] ?? null;
}

export function isDailySortFact(raw: string): raw is DailySortFact {
  return raw === 'task' || raw === 'status' || raw === 'team' || raw === 'marked' || raw === 'dates' || raw === 'order';
}

/**
 * The comparator shape each fact sorts under (blanks-last, numeric vs lexical).
 *
 * On the FACT rather than read off a column, because the desk needs it for a
 * fact that may be bound into any slot — or, on this family's product layout,
 * into none at all. The retired flat `DAILY_GRID_COLUMNS` looked up type by
 * track key and returned `undefined` for every compound track, quietly sorting
 * everything as the default shape.
 */
export const DAILY_SORT_FACT_TYPES: Readonly<Record<DailySortFact, ColumnType>> = {
  task: 'text',
  dates: 'date',
  status: 'tag',
  team: 'number',
  marked: 'date',
  order: 'text',
};

/** Header keys that sort — the descriptor's `isSortable` for this family. */
export function isDailyGridSortable(
  columns: readonly DailyGridColumn[],
  key: string,
): boolean {
  const col = columns.find((c) => c.key === key);
  return col ? dailySortFactFor(col) != null : false;
}

/**
 * The mounted track a `?colsort=` word points at — the direction the header's
 * active-sort mark needs, and the inverse of {@link dailySortFactFor}.
 *
 * One direction only, like Repair: a word with no mounted track simply shows no
 * active header rather than minting a track key the model does not have.
 */
export function dailyColumnKeyForSort(
  columns: readonly DailyGridColumn[],
  fact: DailySortFact | null,
): DailyGridColumnKey | null {
  if (!fact) return null;
  return columns.find((c) => dailySortFactFor(c) === fact)?.key ?? null;
}




/**
 * Recency opens newest-first; everything else ascends.
 *
 * Keyed on the FACT, not the track: `marked` opens `desc` wherever it is bound,
 * so a rebind carries the rule with it instead of leaving it behind on a slot
 * index (the wave-1.4 law — see `tech-all`'s urgency rank for the twin case).
 */
export function defaultDirForDailyGridSort(fact: DailySortFact): GridSortDir {
  return fact === 'marked' ? 'desc' : 'asc';
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
