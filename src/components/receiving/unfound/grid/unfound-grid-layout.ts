/**
 * Unfound queue spreadsheet column model — Admin › PO Mailbox triage map.
 *
 * A row is one `v_unfound_queue` hit (unmatched receiving · email PO). The map
 * is where operators correct ticket ids and team notes in-cell, then open the
 * detail plane for extract / push / delete. Frozen pane = `select` (empty
 * gutter — `multiSelect` is off) + `title` (product identity).
 *
 * `action` is an ACTION track (Push / Synced), not a fact: no `hideKey`, so it
 * is structural and the Fields menu never offers to hide a control.
 */

import { gridFrozenKeys } from '@/design-system/components/grid/grid-column-editability';
import {
  gridFrozenLeft,
  gridTemplate,
} from '@/design-system/components/grid/grid-column-geometry';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type UnfoundGridColumnKey =
  | 'select'
  | 'title'
  | 'ticket'
  | 'usaNote'
  | 'vietnamNote'
  | 'checked'
  | 'action';

export interface UnfoundGridColumn {
  key: UnfoundGridColumnKey;
  width: string;
  label?: string;
  gridLabel?: string;
  labelFitRem?: number;
  type?: ColumnType;
  /** Justification override — see {@link LedgerGridColumnModel.align}. */
  align?: 'start' | 'end';
  /** Part of the frozen identity pane — see {@link LedgerGridColumnModel.frozen}. */
  frozen?: boolean;
  /** Staff-preference key (`staff_preferences.tableColumns.unfound`). */
  hideKey?: string;
  /** `core` ships ON (opt-out); `optional` ships OFF (opt-in via Fields). */
  tier?: 'core' | 'optional';
  /** When false, header is not click-to-sort (gutter / action tracks). */
  sortable?: boolean;
}

/**
 * Canonical Unfound columns. Only `title` flexes; notes are content-hard so a
 * long note truncates in-cell (full text lives on the detail plane).
 *
 * DEFAULT VIEW is the full ops set the hand-rolled table always showed —
 * Ticket · Product · USA note · VN note · Check · Push — with the house
 * `select` gutter leading for frozen-pane rhythm.
 */
export const UNFOUND_GRID_COLUMNS: readonly UnfoundGridColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', sortable: false, frozen: true },
  {
    key: 'title',
    frozen: true,
    width: 'minmax(12rem, 1fr)',
    label: 'Product Title',
    gridLabel: 'Product',
    type: 'text',
    labelFitRem: 8,
  },
  {
    key: 'ticket',
    width: 'minmax(6.75rem, 6.75rem)',
    label: 'Ticket',
    type: 'id',
    hideKey: 'ticket',
    labelFitRem: 4.5,
  },
  {
    key: 'usaNote',
    width: 'minmax(10rem, 10rem)',
    label: 'USA Team Note',
    gridLabel: 'USA note',
    type: 'longtext',
    hideKey: 'usaNote',
    labelFitRem: 6,
  },
  {
    key: 'vietnamNote',
    width: 'minmax(10rem, 10rem)',
    label: 'Vietnam Team Note',
    gridLabel: 'VN note',
    type: 'longtext',
    hideKey: 'vietnamNote',
    labelFitRem: 5.5,
  },
  {
    key: 'checked',
    width: 'minmax(5.5rem, 5.5rem)',
    label: 'Check',
    type: 'tag',
    hideKey: 'checked',
    labelFitRem: 4.5,
  },
  // Action track — no hideKey (structural), no type glyph, never sortable.
  { key: 'action', width: 'minmax(5.5rem, 5.5rem)', sortable: false },
] as const;

/** Frozen identity pane — `select · title`, derived from the model's own flag. */
const UNFOUND_GRID_LOCKED_KEYS: readonly UnfoundGridColumnKey[] =
  gridFrozenKeys(UNFOUND_GRID_COLUMNS);

const UNFOUND_GRID_SORTABLE_KEYS: readonly UnfoundGridColumnKey[] = UNFOUND_GRID_COLUMNS.filter(
  (c) => c.sortable !== false && c.key !== 'select',
).map((c) => c.key);

export function isUnfoundGridSortable(key: string): key is UnfoundGridColumnKey {
  return (UNFOUND_GRID_SORTABLE_KEYS as readonly string[]).includes(key);
}

export function isUnfoundGridFrozen(key: string): boolean {
  return UNFOUND_GRID_LOCKED_KEYS.includes(key as UnfoundGridColumnKey);
}

/** CSS grid template — one `var(--cf-col-<key>, <width>)` track per column. */
export function unfoundGridTemplate(
  columns: readonly UnfoundGridColumn[] = UNFOUND_GRID_COLUMNS,
): string {
  return gridTemplate(columns);
}

/** Sticky offset for a frozen cell — row px + the widths of the locked columns before it. */
export function unfoundGridFrozenLeft(key: UnfoundGridColumnKey): string {
  return gridFrozenLeft(UNFOUND_GRID_COLUMNS, key);
}


/** Default direction on first activation — newest-checked / ticket asc. */
export function defaultDirForUnfoundGridSort(_key: UnfoundGridColumnKey): GridSortDir {
  return 'asc';
}

// Shared spreadsheet chrome — @/design-system/components/grid ledgerGridCell.
export {
  LEDGER_GRID_FROZEN_CELL as UNFOUND_GRID_FROZEN_CELL,
  ledgerGridCell as unfoundGridCell,
  ledgerGridRowShellClass as unfoundGridRowShellClass,
} from '@/design-system/components/grid/grid-cell-chrome';
