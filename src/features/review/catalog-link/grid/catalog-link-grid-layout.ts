/**
 * Review · Catalog link spreadsheet column model — the chore-native sibling of
 * {@link WARRANTY_GRID_COLUMNS} / {@link MY_DAY_GRID_COLUMNS}.
 *
 * Composes the SAME shared geometry as every other house grid
 * (`ordersQueueColVar` · `ordersQueueGridCell` · `ORDERS_QUEUE_FROZEN_CELL`), so
 * a chore row lines up track-for-track with Pending, Unbox and Incoming instead
 * of being a second table language inside Review.
 *
 * **Its own `TableId`, not shared with the Missing-item-number tab.** The two
 * tabs have disjoint identity facts — a chore has an Item Number and no
 * tracking; an exception has tracking and a blank Item Number (that blank is
 * *why* the row exists). One `TableId` would mean hiding `source` on one tab
 * silently hid it on the other, over a column that does not even mean the same
 * thing on both.
 *
 * Frozen pane = `select` (empty gutter — this is browse-and-open, not bulk) +
 * `title` (the flexing listing cell). Title is identity, so it is never in-cell
 * editable; correction happens at the record plane the row opens.
 */

import { gridFrozenKeys } from '@/design-system/components/grid/grid-column-editability';
import { gridTemplate } from '@/design-system/components/grid/grid-column-geometry';
import { ordersQueueColVar } from '@/lib/dashboard-order-row-layout';
import type { ColumnType, TableId } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

/**
 * Per-staff column-prefs bucket + Fields-menu vocabulary key. Named once so the
 * grid's `useGridColumnVisibility` and the column-display rail cannot
 * drift onto two different buckets — that split is invisible until a staffer's
 * toggle stops sticking.
 */
export const CATALOG_LINK_TABLE_ID: TableId = 'catalog-link';

export type CatalogLinkGridColumnKey =
  | 'select'
  | 'title'
  | 'item'
  | 'source'
  | 'sku'
  | 'orders'
  | 'first'
  | 'last';

export interface CatalogLinkGridColumn {
  key: CatalogLinkGridColumnKey;
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
  /** Staff-preference key (`staff_preferences.tableColumns['catalog-link']`). */
  hideKey?: string;
  /** `core` ships ON (opt-out); `optional` ships OFF (opt-in via Fields). */
  tier?: 'core' | 'optional';
}

/**
 * Canonical chore columns. Only `title` flexes; facts are content-hard.
 *
 * **DEFAULT VIEW (tier `core`) is `select · title · item · source · orders ·
 * last`** — the four questions an operator triaging this queue asks without a
 * click: what listing is it, which Item Number failed to match, which account it
 * came from, and how much is blocked behind it. `orders` is the whole reason a
 * chore outranks its neighbours, so it ships on.
 *
 * `sku` and `first` ship `optional` for reasons, not to hit a number:
 *  - `sku` is the sheet's own SKU string, which is **null on most rows** (a
 *    chore exists precisely because nothing resolved) — a mostly-empty ruled band.
 *  - `first` and `last` answer the same question at two ends; `last` is the one
 *    that says "is this still happening", so it is the one that ships.
 *
 * `select` and `title` are frozen, so they carry NO `hideKey` and no `tier`: the
 * Fields menu can never take a row's identity away (`isGridColumnVisible` rule 1).
 */
export const CATALOG_LINK_GRID_COLUMNS: readonly CatalogLinkGridColumn[] = [
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
  {
    key: 'item',
    width: 'minmax(9rem, 9rem)',
    label: 'Item number',
    gridLabel: 'Item #',
    type: 'id',
    hideKey: 'item',
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
    key: 'sku',
    width: 'minmax(8rem, 8rem)',
    label: 'SKU',
    type: 'id',
    hideKey: 'sku',
    tier: 'optional',
    labelFitRem: 4.5,
  },
  {
    key: 'orders',
    width: 'minmax(5rem, 5rem)',
    label: 'Orders',
    type: 'number',
    hideKey: 'orders',
    labelFitRem: 4.5,
  },
  // Date tracks stay narrow because the CELL is the compact civil day
  // (`formatDateKeyShort`) with the full instant in a tooltip — the house grid
  // date recipe. A full `formatDateTimePST` string needs ~11rem and clipped to
  // "07/31/2026 4:2…" at any width a secondary fact deserves.
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

/**
 * Frozen identity pane — `select · title`, derived from the model's own `frozen`
 * flag (one declaration for freeze + immovability + sticky-offset math).
 */
const CATALOG_LINK_LOCKED_KEYS: readonly CatalogLinkGridColumnKey[] =
  gridFrozenKeys(CATALOG_LINK_GRID_COLUMNS);

const CATALOG_LINK_SORTABLE_KEYS: readonly CatalogLinkGridColumnKey[] =
  CATALOG_LINK_GRID_COLUMNS.filter((c) => c.sortable !== false && c.key !== 'select').map(
    (c) => c.key,
  );

export function isCatalogLinkGridSortable(key: string): key is CatalogLinkGridColumnKey {
  return (CATALOG_LINK_SORTABLE_KEYS as readonly string[]).includes(key);
}

export function isCatalogLinkGridFrozen(key: string): boolean {
  return CATALOG_LINK_LOCKED_KEYS.includes(key as CatalogLinkGridColumnKey);
}

/** CSS grid template — one `var(--cf-col-<key>, <width>)` track per column. */
export function catalogLinkGridTemplate(
  columns: readonly CatalogLinkGridColumn[] = CATALOG_LINK_GRID_COLUMNS,
): string {
  return gridTemplate(columns);
}

// Row left-pad — the same token every house grid uses, so the frozen gutter
// aligns with Pending / Unbox / Pickup.
const CATALOG_LINK_ROW_PX = 'var(--cf-queue-row-px, calc(0.75rem * var(--cf-density, 1)))';

/**
 * Sticky offset for a frozen cell — row px plus the summed widths of the locked
 * columns before it. Self-computed over {@link CATALOG_LINK_GRID_COLUMNS} so
 * this surface's own track widths drive the offset.
 */
export function catalogLinkGridFrozenLeft(key: CatalogLinkGridColumnKey): string {
  const idx = CATALOG_LINK_LOCKED_KEYS.indexOf(key);
  const parts = [CATALOG_LINK_ROW_PX];
  for (const k of CATALOG_LINK_LOCKED_KEYS.slice(0, Math.max(0, idx))) {
    const col = CATALOG_LINK_GRID_COLUMNS.find((c) => c.key === k);
    parts.push(`var(${ordersQueueColVar(k)}, ${col?.width ?? '0px'})`);
  }
  return `calc(${parts.join(' + ')})`;
}


/**
 * First-activation direction.
 *
 * `orders` → **descending**: the column exists to answer "which chore is holding
 * up the most orders", and ascending would put the single-order rows first —
 * the opposite of the only reason to sort it. Dates read newest-first for the
 * same reason every other house grid does.
 */
export function defaultDirForCatalogLinkGridSort(
  key: CatalogLinkGridColumnKey,
): GridSortDir {
  if (key === 'orders' || key === 'first' || key === 'last') return 'desc';
  return 'asc';
}

// Shared spreadsheet chrome — the SAME helpers the receiving / outbound / pickup
// grids use. Never re-derive cell padding, hairlines or the row shell here.
export {
  ORDERS_QUEUE_FROZEN_CELL as CATALOG_LINK_GRID_FROZEN_CELL,
  ordersQueueGridCell as catalogLinkGridCell,
  ordersQueueRowShellClass as catalogLinkGridRowShellClass,
} from '@/lib/dashboard-order-row-layout';
