/**
 * Ready / recently-tested spreadsheet column model.
 *
 * A row is one append-only `testing_results` hit with its channel-allocation
 * verdict — a HISTORY record, not a work item: nothing here is edited, selected
 * in bulk, or transitioned from the map. So this is a read-only column set —
 * Product · Verdict · Destination · Reasons · Velocity · Cond · Tested — over
 * the SAME shared geometry every other house spreadsheet uses.
 *
 * Frozen pane = `select` (empty gutter, keeps the left rhythm) + `title`.
 *
 * `action` is an ACTION track (the Stage-FBA escape), not a fact: no `hideKey`,
 * so it is structural and the Fields menu never offers to hide a control.
 */

import { gridFrozenKeys } from '@/design-system/components/grid/grid-column-editability';
import {
  gridFrozenLeft,
  gridTemplate,
} from '@/design-system/components/grid/grid-column-geometry';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type ReadyGridColumnKey =
  | 'select'
  | 'title'
  | 'verdict'
  | 'destination'
  | 'reasons'
  | 'velocity'
  | 'condition'
  | 'tested'
  | 'action';

export interface ReadyGridColumn {
  key: ReadyGridColumnKey;
  width: string;
  label?: string;
  gridLabel?: string;
  labelFitRem?: number;
  type?: ColumnType;
  /** Justification override — see {@link LedgerGridColumnModel.align}. */
  align?: 'start' | 'end';
  /** Part of the frozen identity pane — see {@link LedgerGridColumnModel.frozen}. */
  frozen?: boolean;
  /** Staff-preference key (`staff_preferences.tableColumns.ready`). */
  hideKey?: string;
  /** `core` ships ON (opt-out); `optional` ships OFF (opt-in via Fields). */
  tier?: 'core' | 'optional';
  /** When false, header is not click-to-sort (gutter / action / list tracks). */
  sortable?: boolean;
}

/**
 * Canonical Ready columns. Only `title` flexes; facts are content-hard.
 *
 * DEFAULT VIEW (tier `core`) is `select · title · verdict · destination ·
 * condition · tested · action` — what the operator scanning tested history
 * actually asks: which unit, did it pass, where is it going, what grade, when,
 * and is there anything to do about it.
 *
 * `reasons` and `velocity` ship `optional` because they are the WHY behind
 * `destination` — rationale you open when a destination surprises you, not a
 * column you scan. `reasons` is also a chip LIST, the widest and least
 * scannable thing on the row.
 */
export const READY_GRID_COLUMNS: readonly ReadyGridColumn[] = [
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
  { key: 'verdict', width: 'minmax(5.5rem, 5.5rem)', label: 'Verdict', type: 'tag', hideKey: 'verdict', labelFitRem: 4.5 },
  {
    key: 'destination',
    width: 'minmax(7rem, 7rem)',
    label: 'Destination',
    gridLabel: 'Dest',
    type: 'tag',
    hideKey: 'destination',
    labelFitRem: 4.5,
  },
  {
    key: 'reasons',
    width: 'minmax(10rem, 10rem)',
    label: 'Reasons',
    type: 'tag',
    hideKey: 'reasons',
    tier: 'optional',
    // A chip list has no single value to order by — sorting it would compare
    // whatever happened to be first, which is arbitrary rather than useful.
    sortable: false,
    labelFitRem: 4.5,
  },
  {
    key: 'velocity',
    width: 'minmax(5.5rem, 5.5rem)',
    label: 'Velocity',
    type: 'tag',
    hideKey: 'velocity',
    tier: 'optional',
    labelFitRem: 5,
  },
  { key: 'condition', width: 'minmax(5.5rem, 5.5rem)', label: 'Cond', type: 'tag', hideKey: 'condition', labelFitRem: 4.5 },
  { key: 'tested', width: 'minmax(6.5rem, 6.5rem)', label: 'Tested', type: 'date', hideKey: 'tested', labelFitRem: 4.5 },
  // Action track — no hideKey (structural), no type glyph, never sortable.
  { key: 'action', width: 'minmax(6.5rem, 6.5rem)', sortable: false },
] as const;

/** Frozen identity pane — `select · title`, derived from the model's own flag. */
const READY_GRID_LOCKED_KEYS: readonly ReadyGridColumnKey[] = gridFrozenKeys(READY_GRID_COLUMNS);

const READY_GRID_SORTABLE_KEYS: readonly ReadyGridColumnKey[] = READY_GRID_COLUMNS.filter(
  (c) => c.sortable !== false && c.key !== 'select',
).map((c) => c.key);

export function isReadyGridSortable(key: string): key is ReadyGridColumnKey {
  return (READY_GRID_SORTABLE_KEYS as readonly string[]).includes(key);
}

export function isReadyGridFrozen(key: string): boolean {
  return READY_GRID_LOCKED_KEYS.includes(key as ReadyGridColumnKey);
}

/** CSS grid template — one `var(--cf-col-<key>, <width>)` track per column. */
export function readyGridTemplate(
  columns: readonly ReadyGridColumn[] = READY_GRID_COLUMNS,
): string {
  return gridTemplate(columns);
}

/** Sticky offset for a frozen cell — row px + the widths of the locked columns before it. */
export function readyGridFrozenLeft(key: ReadyGridColumnKey): string {
  return gridFrozenLeft(READY_GRID_COLUMNS, key);
}


/** Default direction on first activation — tested history reads newest-first. */
export function defaultDirForReadyGridSort(key: ReadyGridColumnKey): GridSortDir {
  if (key === 'tested') return 'desc';
  return 'asc';
}

// Shared spreadsheet chrome — @/design-system/components/grid ledgerGridCell.
export {
  LEDGER_GRID_FROZEN_CELL as READY_GRID_FROZEN_CELL,
  ledgerGridCell as readyGridCell,
  ledgerGridRowShellClass as readyGridRowShellClass,
} from '@/design-system/components/grid/grid-cell-chrome';
