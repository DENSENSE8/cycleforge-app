/**
 * Review · Missing item number spreadsheet column model — the sibling of
 * {@link CATALOG_LINK_GRID_COLUMNS} for sheet rows that never became orders
 * because their Item Number cell was blank.
 *
 * **A separate column model AND a separate `TableId`, deliberately.** The two
 * Review · Catalog-link tabs answer different questions with disjoint identity
 * facts: a chore is keyed by the Item Number that failed to MATCH, an exception
 * is keyed by the marketplace order id and its tracking, and its Item Number is
 * *absent* — which is the whole reason the row exists. Sharing one model would
 * force half the tracks to render an em dash on every row of one tab; sharing
 * one `TableId` would mean a Fields toggle on one tab silently hid a track on
 * the other.
 *
 * Frozen pane = `select` (empty gutter) + `title` (the flexing listing cell),
 * same as every other house grid.
 */

import { gridFrozenKeys } from '@/design-system/components/grid/grid-column-editability';
import { gridTemplate } from '@/design-system/components/grid/grid-column-geometry';
import { ordersQueueColVar } from '@/lib/dashboard-order-row-layout';
import type { ColumnType, TableId } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

/** Per-staff column-prefs bucket + Fields-menu vocabulary key. */
export const IMPORT_EXCEPTION_TABLE_ID: TableId = 'import-exception';

export type ImportExceptionGridColumnKey =
  | 'select'
  | 'title'
  | 'order'
  | 'source'
  | 'tracking'
  | 'sheet'
  | 'seen'
  | 'first'
  | 'last';

export interface ImportExceptionGridColumn {
  key: ImportExceptionGridColumnKey;
  width: string;
  label?: string;
  gridLabel?: string;
  labelFitRem?: number;
  type?: ColumnType;
  /** Justification override — see {@link LedgerGridColumnModel.align}. */
  align?: 'start' | 'end';
  /** Part of the frozen identity pane — see {@link LedgerGridColumnModel.frozen}. */
  frozen?: boolean;
  /** When false the header is not click-to-sort (the select gutter only). */
  sortable?: boolean;
  /** Staff-preference key (`staff_preferences.tableColumns['import-exception']`). */
  hideKey?: string;
  /** `core` ships ON (opt-out); `optional` ships OFF (opt-in via Fields). */
  tier?: 'core' | 'optional';
}

/**
 * Canonical exception columns. Only `title` flexes; facts are content-hard.
 *
 * **DEFAULT VIEW (tier `core`) is `select · title · order · source · tracking ·
 * seen · last`** — everything an operator needs to go find the real Item Number:
 * what was sold, which order id the source sent, which account, and the tracking
 * number that identifies the physical package. `seen` ships on because a row
 * seen 40 times is a recurring import bug, not a one-off typo.
 *
 * `sheet` and `first` ship `optional`:
 *  - `sheet` (the source spreadsheet row) is a debugging pointer, useful when
 *    you are editing the sheet and useless when you are not.
 *  - `first` and `last` answer the same question at two ends; `last` is the one
 *    that says "is this still happening".
 */
export const IMPORT_EXCEPTION_GRID_COLUMNS: readonly ImportExceptionGridColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', sortable: false, frozen: true },
  {
    key: 'title',
    frozen: true,
    width: 'minmax(14rem, 1fr)',
    label: 'Listing',
    gridLabel: 'Listing',
    type: 'text',
    labelFitRem: 8,
  },
  // Shown WHOLE, not last-8. A marketplace order id is what the operator pastes
  // back into the source sheet to find the row, and last-8 cuts a hyphenated
  // eBay id mid-segment — `12-34567-9232204` rendered as `-9232204`, which in an
  // end-aligned track reads as a negative number.
  {
    key: 'order',
    width: 'minmax(10rem, 10rem)',
    label: 'Order',
    type: 'id',
    hideKey: 'order',
    labelFitRem: 4.5,
  },
  {
    key: 'source',
    width: 'minmax(6rem, 6rem)',
    label: 'Account',
    type: 'external',
    hideKey: 'source',
    labelFitRem: 4.5,
  },
  {
    key: 'tracking',
    width: 'minmax(8rem, 8rem)',
    label: 'Tracking',
    type: 'location',
    hideKey: 'tracking',
    labelFitRem: 4.5,
  },
  {
    key: 'sheet',
    width: 'minmax(5rem, 5rem)',
    label: 'Sheet row',
    gridLabel: 'Row',
    type: 'number',
    hideKey: 'sheet',
    tier: 'optional',
    labelFitRem: 4.5,
  },
  {
    key: 'seen',
    width: 'minmax(4.5rem, 4.5rem)',
    label: 'Seen',
    type: 'number',
    hideKey: 'seen',
    labelFitRem: 4.5,
  },
  // Compact civil day + full-instant tooltip — see the note on the sibling model.
  {
    key: 'first',
    width: 'minmax(5.5rem, 5.5rem)',
    label: 'First seen',
    gridLabel: 'First',
    type: 'date',
    hideKey: 'first',
    tier: 'optional',
    labelFitRem: 4.5,
  },
  {
    key: 'last',
    width: 'minmax(5.5rem, 5.5rem)',
    label: 'Last seen',
    gridLabel: 'Last',
    type: 'date',
    hideKey: 'last',
    labelFitRem: 4.5,
  },
] as const;

/** Frozen identity pane — `select · title`, derived from the model's own flag. */
const IMPORT_EXCEPTION_LOCKED_KEYS: readonly ImportExceptionGridColumnKey[] = gridFrozenKeys(
  IMPORT_EXCEPTION_GRID_COLUMNS,
);

const IMPORT_EXCEPTION_SORTABLE_KEYS: readonly ImportExceptionGridColumnKey[] =
  IMPORT_EXCEPTION_GRID_COLUMNS.filter((c) => c.sortable !== false && c.key !== 'select').map(
    (c) => c.key,
  );

export function isImportExceptionGridSortable(key: string): key is ImportExceptionGridColumnKey {
  return (IMPORT_EXCEPTION_SORTABLE_KEYS as readonly string[]).includes(key);
}

export function isImportExceptionGridFrozen(key: string): boolean {
  return IMPORT_EXCEPTION_LOCKED_KEYS.includes(key as ImportExceptionGridColumnKey);
}

/** CSS grid template — one `var(--cf-col-<key>, <width>)` track per column. */
export function importExceptionGridTemplate(
  columns: readonly ImportExceptionGridColumn[] = IMPORT_EXCEPTION_GRID_COLUMNS,
): string {
  return gridTemplate(columns);
}

const IMPORT_EXCEPTION_ROW_PX = 'var(--cf-queue-row-px, calc(0.75rem * var(--cf-density, 1)))';

/** Sticky offset for a frozen cell — row px + the widths of the locked columns before it. */
export function importExceptionGridFrozenLeft(key: ImportExceptionGridColumnKey): string {
  const idx = IMPORT_EXCEPTION_LOCKED_KEYS.indexOf(key);
  const parts = [IMPORT_EXCEPTION_ROW_PX];
  for (const k of IMPORT_EXCEPTION_LOCKED_KEYS.slice(0, Math.max(0, idx))) {
    const col = IMPORT_EXCEPTION_GRID_COLUMNS.find((c) => c.key === k);
    parts.push(`var(${ordersQueueColVar(k)}, ${col?.width ?? '0px'})`);
  }
  return `calc(${parts.join(' + ')})`;
}


/**
 * First-activation direction. `seen` → **descending**: the reason to sort it is
 * "which import bug is firing most", and ascending buries that under the
 * one-offs. Dates read newest-first.
 */
export function defaultDirForImportExceptionGridSort(
  key: ImportExceptionGridColumnKey,
): GridSortDir {
  if (key === 'seen' || key === 'first' || key === 'last') return 'desc';
  return 'asc';
}

// Shared spreadsheet chrome — the SAME helpers every other house grid uses.
export {
  ORDERS_QUEUE_FROZEN_CELL as IMPORT_EXCEPTION_GRID_FROZEN_CELL,
  ordersQueueGridCell as importExceptionGridCell,
  ordersQueueRowShellClass as importExceptionGridRowShellClass,
} from '@/lib/dashboard-order-row-layout';
