/** Tracking Exceptions spreadsheet column model — the ops-native sibling of {@link WARRANTY_GRID_COLUMNS}. */

import {
  gridFrozenLeft,
  gridTemplate,
} from '@/design-system/components/grid/grid-column-geometry';
import {
  TRACKING_EXCEPTIONS_FIELD_CATALOG,
  TRACKING_EXCEPTIONS_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/tracking-exceptions';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type TrackingExceptionsGridColumnKey =
  | 'select'
  | 'title'
  /** Retry / edit — structural capability, never an org column. */
  | 'actions'
  /** Materialized slot tracks — keys are slot indices, never field ids. */
  | `status:${number}`
  | `subtitle:${number}`;

export interface TrackingExceptionsGridColumn extends SlotTrackFields {
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
 * The structural sheet skeleton — what the queue paints with ZERO bindings.
 * `title` (the scanned number) is the only flex track; the frozen pane is
 * `select · title`; the retry/edit action closes the row.
 */
const TRACKING_EXCEPTIONS_SHEET_BASE: readonly TrackingExceptionsGridColumn[] = [
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
  // Action track — no hideKey (structural), no type glyph, never sortable.
  { key: 'actions', width: 'minmax(5rem, 5rem)', sortable: false },
];

/**
 * Materialize the mounted columns from an effective layout. Both bands anchor
 * on `title`, so the default plate reads carrier · reason · status · created —
 * the retired hand model's core view — with `actions` always last.
 */
export function trackingExceptionsSheetColumnsFor(
  layout: SlotLayout,
): readonly TrackingExceptionsGridColumn[] {
  return materializeTracks<TrackingExceptionsGridColumn>({
    layout,
    catalog: TRACKING_EXCEPTIONS_FIELD_CATALOG,
    base: TRACKING_EXCEPTIONS_SHEET_BASE,
    statusAnchorKey: 'title',
    subtitleAnchorKey: 'title',
  });
}

/**
 * The PRODUCT-DEFAULT materialization — what an org with no override mounts,
 * the canonical columns of the binding, and the guard SoT.
 */
export const TRACKING_EXCEPTIONS_SHEET_COLUMNS: readonly TrackingExceptionsGridColumn[] =
  trackingExceptionsSheetColumnsFor(TRACKING_EXCEPTIONS_PRODUCT_LAYOUT);

/** The FACT a column sorts by, or null when it offers no sort. */
export function trackingExceptionsSortFactFor(
  col: TrackingExceptionsGridColumn,
): string | null {
  if (col.sortable === false || col.key === 'select' || col.key === 'actions') return null;
  if (col.key === 'title') return 'title';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isTrackingExceptionsColumnSortable(
  columns: readonly TrackingExceptionsGridColumn[],
  key: string,
): key is TrackingExceptionsGridColumnKey {
  return columns.some((c) => c.key === key && trackingExceptionsSortFactFor(c) !== null);
}

/** CSS grid template — one `var(--cf-col-<key>, <width>)` track per column. */
export function trackingExceptionsGridTemplate(
  columns: readonly TrackingExceptionsGridColumn[] = TRACKING_EXCEPTIONS_SHEET_COLUMNS,
): string {
  return gridTemplate(columns);
}

/** Sticky offset for a frozen cell, derived from the MOUNTED model. */
export function trackingExceptionsGridFrozenLeft(
  columns: readonly TrackingExceptionsGridColumn[],
  key: TrackingExceptionsGridColumnKey,
): string {
  return gridFrozenLeft(columns, key);
}

/**
 * Default direction when first activating a column sort: dates read newest
 * first, and retries most-retries-first — the stuck rows are the point of the
 * queue.
 */
export function defaultDirForTrackingExceptionsColumn(
  columns: readonly TrackingExceptionsGridColumn[],
  key: string,
): GridSortDir {
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}

// Shared spreadsheet chrome — @/design-system/components/grid ledgerGridCell.
export {
  LEDGER_GRID_FROZEN_CELL as TRACKING_EXCEPTIONS_GRID_FROZEN_CELL,
  ledgerGridCell as trackingExceptionsGridCell,
  ledgerGridRowShellClass as trackingExceptionsGridRowShellClass,
} from '@/design-system/components/grid/grid-cell-chrome';
