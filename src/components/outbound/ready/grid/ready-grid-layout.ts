/**
 * Ready / recently-tested sheet column model — MATERIALIZED from a
 * {@link SlotLayout}, never a hand array.
 *
 * A row is one append-only `testing_results` hit with its channel-allocation
 * verdict — a HISTORY record, not a work item: nothing here is edited, selected
 * in bulk, or transitioned from the map.
 *
 * The static `READY_GRID_COLUMNS` died with the seller-table-program's wave 1.1
 * port (`docs/todo/seller-table-program-PLAN.md` §03; `docs/kill-list/
 * 07-slot-table-hand-models.md` — the `ready` row). It carried a literal
 * `{ key: 'tested', … }` track and painted `data-col="tested"`: the forbidden
 * pattern, live, off To-ship. A track whose key IS a field cannot be unbound by
 * an organization and cannot be captured as `tableLayouts.ready`.
 *
 * What remains STRUCTURAL is the sheet skeleton — the frozen `select · title`
 * pane (Product, with its identifier trail; `ready.unit` is the identity fact
 * it resolves) and the trailing `action` track, which is an ACTION (the
 * Stage-FBA escape), not a fact: it is a capability, so the Fields menu never
 * offers to hide a control. Everything between them is a catalog fact an
 * org/staffer binds — subtitle band (`subtitle:1…N`) directly after Product,
 * status band (`status:1…N`) after those, both ahead of `action`.
 *
 * Sort and frozen-offset helpers derive from the MOUNTED model, never a module
 * constant — the Wave-1 lesson: a key-only closure over a static list is how
 * offsets and sortability go stale the moment the mounted model moves.
 *
 * One geometry drift the port pays for family-agnostic tracks, named so nobody
 * "fixes" it back into a hand width: Destination and Tested rode hand-tuned
 * 7rem / 6.5rem tracks; they now take the `tag` / `date` display-type geometry
 * like every other bound fact in the repo.
 */

import { gridFrozenLeft, gridTemplate } from '@/design-system/components/grid/grid-column-geometry';
import { READY_FIELD_CATALOG, READY_PRODUCT_LAYOUT } from '@/lib/tables/field-catalog/ready';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type ReadyGridColumnKey =
  | 'select'
  | 'title'
  /** The Stage-FBA escape — structural capability, never an org column. */
  | 'action'
  /** Materialized slot tracks — keys are slot indices, never field ids. */
  | `status:${number}`
  | `subtitle:${number}`;

export interface ReadyGridColumn extends SlotTrackFields {
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
  minTrackRem?: number;
  resizable?: boolean;
  /** When false, header is not click-to-sort (gutter / action tracks). */
  sortable?: boolean;
}

/**
 * The structural sheet skeleton — what Ready paints with ZERO bindings.
 * `title` is the only flex track; the frozen pane is `select · title`; the
 * Stage-FBA `action` track closes the row. Slot bands insert between them.
 */
const READY_SHEET_BASE: readonly ReadyGridColumn[] = [
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
  // Action track — structural, no glyph type, never sortable.
  { key: 'action', width: 'minmax(6.5rem, 6.5rem)', sortable: false },
];

/**
 * Materialize the mounted Ready columns from an effective layout. Both bands
 * anchor on `title`: subtitles land directly after Product, the status band
 * after those — so the default plate reads verdict · destination · cond ·
 * tested, exactly the retired hand model's core scan order, with `action`
 * always last.
 */
export function readySheetColumnsFor(layout: SlotLayout): readonly ReadyGridColumn[] {
  return materializeTracks<ReadyGridColumn>({
    layout,
    catalog: READY_FIELD_CATALOG,
    base: READY_SHEET_BASE,
    statusAnchorKey: 'title',
    subtitleAnchorKey: 'title',
  });
}

/**
 * The PRODUCT-DEFAULT materialization — what an org with no override mounts
 * (`select · title · verdict · destination · cond · tested · action`, the
 * retired hand model's core view), the canonical columns of the Ready binding,
 * and the guard SoT.
 */
export const READY_SHEET_COLUMNS: readonly ReadyGridColumn[] =
  readySheetColumnsFor(READY_PRODUCT_LAYOUT);

/**
 * The FACT a column sorts by, or null when it offers no sort.
 *
 * `ready.reasons` is deliberately unsortable wherever it is bound: it is a chip
 * LIST, so ordering it would compare whichever reason happened to be first,
 * which is arbitrary rather than useful. That rule belongs to the FACT, not to
 * a track key — a rebind must carry it.
 */
export function readySortFactFor(col: ReadyGridColumn): string | null {
  if (col.sortable === false || col.key === 'select' || col.key === 'action') return null;
  if (col.key === 'title') return 'title';
  if (col.fieldId === 'ready.reasons') return null;
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isReadyColumnSortable(
  columns: readonly ReadyGridColumn[],
  key: string,
): key is ReadyGridColumnKey {
  return columns.some((c) => c.key === key && readySortFactFor(c) !== null);
}

/**
 * Default direction when first activating a column sort: tested history and
 * other magnitudes read newest/biggest first (`date` / `money` / `number`
 * display types), names and ids alphabetically.
 */
export function defaultDirForReadyColumn(
  columns: readonly ReadyGridColumn[],
  key: string,
): GridSortDir {
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}

/** CSS grid template — one `var(--cf-col-<key>, <width>)` track per column. */
export function readyGridTemplate(
  columns: readonly ReadyGridColumn[] = READY_SHEET_COLUMNS,
): string {
  return gridTemplate(columns);
}

/** Sticky offset for a frozen cell, derived from the MOUNTED model. */
export function readyGridFrozenLeft(
  columns: readonly ReadyGridColumn[],
  key: ReadyGridColumnKey,
): string {
  return gridFrozenLeft(columns, key);
}

// Shared spreadsheet chrome — @/design-system/components/grid ledgerGridCell.
export {
  LEDGER_GRID_FROZEN_CELL as READY_GRID_FROZEN_CELL,
  ledgerGridCell as readyGridCell,
  ledgerGridRowShellClass as readyGridRowShellClass,
} from '@/design-system/components/grid/grid-cell-chrome';
