/**
 * Unfound queue spreadsheet column model — MATERIALIZED from a
 * {@link SlotLayout}, never a hand array.
 *
 * A row is one `v_unfound_queue` hit (unmatched receiving · email PO). The
 * static `UNFOUND_GRID_COLUMNS` died with wave 1.4 of the seller-table program:
 * tracks whose keys WERE fields (`ticket`, `usaNote`, `checked`) are a frozen
 * layout no organization can capture.
 *
 * What remains STRUCTURAL is the sheet skeleton — the frozen `select` gutter
 * (empty; `multiSelect` is off) and the frozen, flexing `title` product track
 * (`unfound.item` is the identity FACT it stands for) — plus the trailing
 * `action` track (Push / Synced), which is an ACTION, not a fact: no `hideKey`,
 * so the Fields menu never offers to hide a control.
 */

import {
  gridFrozenLeft,
  gridTemplate,
} from '@/design-system/components/grid/grid-column-geometry';
import {
  UNFOUND_FIELD_CATALOG,
  UNFOUND_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/unfound';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type UnfoundGridColumnKey =
  | 'select'
  | 'title'
  /** Push / Synced — structural capability, never an org column. */
  | 'action'
  /** Materialized slot tracks — keys are slot indices, never field ids. */
  | `status:${number}`
  | `subtitle:${number}`;

export interface UnfoundGridColumn extends SlotTrackFields {
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
 * The structural sheet skeleton — what Unfound paints with ZERO bindings.
 * `title` is the only flex track; the frozen pane is `select · title`; the
 * Push action closes the row.
 */
const UNFOUND_SHEET_BASE: readonly UnfoundGridColumn[] = [
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
  // Action track — no hideKey (structural), no type glyph, never sortable.
  { key: 'action', width: 'minmax(5.5rem, 5.5rem)', sortable: false },
];

/**
 * Materialize the mounted Unfound columns from an effective layout. Both bands
 * anchor on `title`, so the default plate reads ticket · USA note · VN note ·
 * check — the hand model's full ops set — with `action` always last.
 */
export function unfoundSheetColumnsFor(layout: SlotLayout): readonly UnfoundGridColumn[] {
  return materializeTracks<UnfoundGridColumn>({
    layout,
    catalog: UNFOUND_FIELD_CATALOG,
    base: UNFOUND_SHEET_BASE,
    statusAnchorKey: 'title',
    subtitleAnchorKey: 'title',
  });
}

/**
 * The PRODUCT-DEFAULT materialization — what an org with no override mounts,
 * the canonical columns of the unfound binding, and the guard SoT.
 */
export const UNFOUND_SHEET_COLUMNS: readonly UnfoundGridColumn[] =
  unfoundSheetColumnsFor(UNFOUND_PRODUCT_LAYOUT);

/** The FACT a column sorts by, or null when it offers no sort. */
export function unfoundSortFactFor(col: UnfoundGridColumn): string | null {
  if (col.sortable === false || col.key === 'select' || col.key === 'action') return null;
  if (col.key === 'title') return 'title';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isUnfoundColumnSortable(
  columns: readonly UnfoundGridColumn[],
  key: string,
): key is UnfoundGridColumnKey {
  return columns.some((c) => c.key === key && unfoundSortFactFor(c) !== null);
}

/** CSS grid template — one `var(--cf-col-<key>, <width>)` track per column. */
export function unfoundGridTemplate(
  columns: readonly UnfoundGridColumn[] = UNFOUND_SHEET_COLUMNS,
): string {
  return gridTemplate(columns);
}

/** Sticky offset for a frozen cell, derived from the MOUNTED model. */
export function unfoundGridFrozenLeft(
  columns: readonly UnfoundGridColumn[],
  key: UnfoundGridColumnKey,
): string {
  return gridFrozenLeft(columns, key);
}

/**
 * Default direction on first activation.
 *
 * This queue opens ASCENDING on every track, including its date: the oldest
 * uncleared row is the one that needs a human, so "newest first" — the house
 * default for a date — would bury exactly the row the queue exists to surface.
 * The rule is the family's, not a per-key list.
 */
export function defaultDirForUnfoundColumn(
  _columns: readonly UnfoundGridColumn[],
  _key: string,
): GridSortDir {
  return 'asc';
}

// Shared spreadsheet chrome — @/design-system/components/grid ledgerGridCell.
export {
  LEDGER_GRID_FROZEN_CELL as UNFOUND_GRID_FROZEN_CELL,
  ledgerGridCell as unfoundGridCell,
  ledgerGridRowShellClass as unfoundGridRowShellClass,
} from '@/design-system/components/grid/grid-cell-chrome';
