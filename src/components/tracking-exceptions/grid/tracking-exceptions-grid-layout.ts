/**
 * Tracking Exceptions spreadsheet column model — the ops-native sibling of
 * {@link WARRANTY_GRID_COLUMNS} / {@link READY_GRID_COLUMNS}.
 *
 * A row is one unmatched receiving scan waiting on Zoho re-query or a human
 * edit. No fold, no day band, no in-cell edit — corrections open the record
 * plane (edit dialog). Frozen pane = `select` + `title` (tracking identity).
 *
 * `actions` is an ACTION track (Refresh · Edit), not a fact: no `hideKey`, so
 * it is structural and the Fields menu never offers to hide a control.
 */

import { gridFrozenKeys } from '@/design-system/components/grid/grid-column-editability';
import {
  gridFrozenLeft,
  gridTemplate,
} from '@/design-system/components/grid/grid-column-geometry';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type TrackingExceptionsGridColumnKey =
  | 'select'
  | 'title'
  | 'carrier'
  | 'source'
  | 'staff'
  | 'reason'
  | 'status'
  | 'retries'
  | 'lastCheck'
  | 'created'
  | 'notes'
  | 'actions';

export interface TrackingExceptionsGridColumn {
  key: TrackingExceptionsGridColumnKey;
  width: string;
  label?: string;
  gridLabel?: string;
  labelFitRem?: number;
  type?: ColumnType;
  /** Justification override — see {@link LedgerGridColumnModel.align}. */
  align?: 'start' | 'end';
  /** Part of the frozen identity pane — see {@link LedgerGridColumnModel.frozen}. */
  frozen?: boolean;
  /** Staff-preference key (`staff_preferences.tableColumns.tracking-exceptions`). */
  hideKey?: string;
  /** `core` ships ON (opt-out); `optional` ships OFF (opt-in via Fields). */
  tier?: 'core' | 'optional';
  /** When false, header is not click-to-sort (gutter / action tracks). Default true. */
  sortable?: boolean;
}

/**
 * Canonical Tracking Exceptions columns. Only `title` flexes; facts are content-hard.
 *
 * DEFAULT VIEW (tier `core`) is `select · title · carrier · reason · status ·
 * created · actions` — the questions an ops operator scanning unmatched
 * receiving scans actually asks. Source / staff / retries / last check / notes
 * are attribution or Zoho-sync detail: useful when investigating one row, not
 * columns you scan down the queue.
 */
export const TRACKING_EXCEPTIONS_GRID_COLUMNS: readonly TrackingExceptionsGridColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', sortable: false, frozen: true },
  {
    key: 'title',
    frozen: true,
    width: 'minmax(10rem, 1fr)',
    label: 'Tracking',
    gridLabel: 'Tracking',
    type: 'tracking',
    labelFitRem: 6,
  },
  {
    key: 'carrier',
    width: 'minmax(6.5rem, 6.5rem)',
    label: 'Carrier',
    type: 'text',
    hideKey: 'carrier',
    labelFitRem: 5,
  },
  {
    key: 'source',
    width: 'minmax(6rem, 6rem)',
    label: 'Source',
    type: 'text',
    hideKey: 'source',
    tier: 'optional',
    labelFitRem: 4.5,
  },
  {
    key: 'staff',
    width: 'minmax(7rem, 7rem)',
    label: 'Staff',
    type: 'text',
    hideKey: 'staff',
    tier: 'optional',
    labelFitRem: 4,
  },
  {
    key: 'reason',
    width: 'minmax(7rem, 7rem)',
    label: 'Reason',
    type: 'tag',
    hideKey: 'reason',
    labelFitRem: 4.5,
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
    key: 'retries',
    width: 'minmax(5rem, 5rem)',
    label: 'Retries',
    type: 'number',
    hideKey: 'retries',
    tier: 'optional',
    labelFitRem: 4.5,
  },
  {
    key: 'lastCheck',
    width: 'minmax(6.5rem, 6.5rem)',
    label: 'Last check',
    type: 'date',
    hideKey: 'lastCheck',
    tier: 'optional',
    labelFitRem: 6,
  },
  {
    key: 'created',
    width: 'minmax(6rem, 6rem)',
    label: 'Created',
    type: 'date',
    hideKey: 'created',
    labelFitRem: 5,
  },
  {
    key: 'notes',
    width: 'minmax(10rem, 10rem)',
    label: 'Notes',
    type: 'longtext',
    hideKey: 'notes',
    tier: 'optional',
    labelFitRem: 4,
  },
  // Action track — no hideKey (structural), no type glyph, never sortable.
  { key: 'actions', width: 'minmax(5rem, 5rem)', sortable: false },
] as const;

/**
 * Frozen identity pane — `select · title`. Derived from the model's `frozen`
 * flag (one declaration for freeze + immovability + offset math).
 */
const TRACKING_EXCEPTIONS_GRID_LOCKED_KEYS: readonly TrackingExceptionsGridColumnKey[] =
  gridFrozenKeys(TRACKING_EXCEPTIONS_GRID_COLUMNS);

const TRACKING_EXCEPTIONS_GRID_SORTABLE_KEYS: readonly TrackingExceptionsGridColumnKey[] =
  TRACKING_EXCEPTIONS_GRID_COLUMNS.filter(
    (c) => c.sortable !== false && c.key !== 'select',
  ).map((c) => c.key);

export function isTrackingExceptionsGridSortable(
  key: string,
): key is TrackingExceptionsGridColumnKey {
  return (TRACKING_EXCEPTIONS_GRID_SORTABLE_KEYS as readonly string[]).includes(key);
}

export function isTrackingExceptionsGridFrozen(key: string): boolean {
  return TRACKING_EXCEPTIONS_GRID_LOCKED_KEYS.includes(key as TrackingExceptionsGridColumnKey);
}

/** CSS grid template — one `var(--cf-col-<key>, <width>)` track per column. */
export function trackingExceptionsGridTemplate(
  columns: readonly TrackingExceptionsGridColumn[] = TRACKING_EXCEPTIONS_GRID_COLUMNS,
): string {
  return gridTemplate(columns);
}

/**
 * Sticky offset for a frozen cell — row px + the summed widths of the locked
 * columns before it.
 */
export function trackingExceptionsGridFrozenLeft(key: TrackingExceptionsGridColumnKey): string {
  return gridFrozenLeft(TRACKING_EXCEPTIONS_GRID_COLUMNS, key);
}


/**
 * Default direction when first activating a column sort.
 *
 * Date columns → newest first. Retries → most retries first (the stuck ones).
 */
export function defaultDirForTrackingExceptionsGridSort(
  key: TrackingExceptionsGridColumnKey,
): GridSortDir {
  if (key === 'created' || key === 'lastCheck' || key === 'retries') return 'desc';
  return 'asc';
}

// Shared spreadsheet chrome — @/design-system/components/grid ledgerGridCell.
export {
  LEDGER_GRID_FROZEN_CELL as TRACKING_EXCEPTIONS_GRID_FROZEN_CELL,
  ledgerGridCell as trackingExceptionsGridCell,
  ledgerGridRowShellClass as trackingExceptionsGridRowShellClass,
} from '@/design-system/components/grid/grid-cell-chrome';
