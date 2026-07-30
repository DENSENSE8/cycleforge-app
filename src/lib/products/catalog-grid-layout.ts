/**
 * Catalog spreadsheet column model — SoT for the Products Catalog LedgerGrid.
 *
 * Same spreadsheet family as Pending / Repair:
 *   select · title · sku · inventory · channels · manuals · qc · orders · status
 *
 * Frozen identity pane (select · title) + cell chrome reuse the shared grid
 * geometry from {@link ORDERS_QUEUE_COLUMNS}'s helpers.
 */

import { GRID_IDENTITY_COLUMN_KEYS } from '@/design-system/components/grid/grid-column-editability';
import { gridTemplate } from '@/design-system/components/grid/grid-column-geometry';
import type { CatalogListRow } from '@/components/products/catalog/types';
import type { ColumnType } from '@/lib/tables/table-columns';

export type CatalogGridColumnKey =
  | 'select'
  | 'title'
  | 'sku'
  | 'inventory'
  | 'channels'
  | 'manuals'
  | 'qc'
  | 'orders'
  | 'status';

export interface CatalogGridColumn {
  key: CatalogGridColumnKey;
  width: string;
  label?: string;
  gridLabel?: string;
  labelFitRem?: number;
  type?: ColumnType;
  /** Justification override — see {@link LedgerGridColumnModel.align}. */
  align?: 'start' | 'end';
  /** Staff-preference key (`staff_preferences.tableColumns.catalog`). */
  hideKey?: string;
  /** `core` ships ON (opt-out); `optional` ships OFF (opt-in via Fields). */
  tier?: 'core' | 'optional';
  /** When false, the header is not click-to-sort (select gutter only). */
  sortable?: boolean;
}

/**
 * Canonical catalog columns.
 *
 * DEFAULT VIEW (tier `core`) is deliberately lean — `select · title · sku ·
 * inventory · status`: what the product is, how it is keyed, whether it is wired
 * to the inventory master (the catalog's whole job, and the axis the Filter
 * popover slices on), and whether it needs attention. The four roll-up COUNTS
 * (channels · manuals · qc · orders) are drill-down analytics, not scan facts —
 * they ship `optional` so a first-load catalog reads as a product list instead
 * of a numbers table. Staff opt them back in per-person via the Fields menu.
 */
export const CATALOG_GRID_COLUMNS: readonly CatalogGridColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', sortable: false },
  {
    key: 'title',
    width: 'minmax(14rem, 1fr)',
    label: 'Product',
    type: 'text',
    labelFitRem: 8,
  },
  { key: 'sku', width: 'minmax(7rem, 7rem)', label: 'SKU', type: 'id', hideKey: 'sku', labelFitRem: 3 },
  {
    key: 'inventory',
    width: 'minmax(6.5rem, 6.5rem)',
    label: 'Inventory',
    // Typed `id` for the header glyph, but the cell is a linkage chip — keep
    // start so it does not join the numeric end-align cluster.
    type: 'id',
    align: 'start',
    hideKey: 'inventory',
    labelFitRem: 5,
  },
  {
    key: 'channels',
    width: 'minmax(4.5rem, 4.5rem)',
    label: 'Channels',
    gridLabel: 'Ch',
    type: 'number',
    hideKey: 'channels',
    tier: 'optional',
    labelFitRem: 4.5,
  },
  {
    key: 'manuals',
    width: 'minmax(4.5rem, 4.5rem)',
    label: 'Manuals',
    gridLabel: 'Man',
    type: 'number',
    hideKey: 'manuals',
    tier: 'optional',
    labelFitRem: 4.5,
  },
  {
    key: 'qc',
    width: 'minmax(3.5rem, 3.5rem)',
    label: 'QC',
    type: 'number',
    hideKey: 'qc',
    tier: 'optional',
    labelFitRem: 2.5,
  },
  {
    key: 'orders',
    // 4.75rem: 'Orders' is 6 chars ≈ 2.52rem + 2rem header chrome. See incoming `status`.
    width: 'minmax(4.75rem, 4.75rem)',
    label: 'Orders',
    type: 'number',
    hideKey: 'orders',
    tier: 'optional',
    labelFitRem: 4,
  },
  {
    key: 'status',
    width: 'minmax(5.5rem, 5.5rem)',
    label: 'Status',
    type: 'tag',
    hideKey: 'status',
    labelFitRem: 4,
  },
] as const;

const CATALOG_GRID_LOCKED_KEYS: readonly CatalogGridColumnKey[] = [
  ...GRID_IDENTITY_COLUMN_KEYS,
];

const CATALOG_GRID_SORTABLE_KEYS: readonly CatalogGridColumnKey[] = CATALOG_GRID_COLUMNS.filter(
  (c) => c.sortable !== false && c.key !== 'select',
).map((c) => c.key);

export function isCatalogGridSortable(key: string): key is CatalogGridColumnKey {
  return (CATALOG_GRID_SORTABLE_KEYS as readonly string[]).includes(key);
}


export function catalogGridTemplate(
  columns: readonly CatalogGridColumn[] = CATALOG_GRID_COLUMNS,
): string {
  return gridTemplate(columns);
}

export function isCatalogGridFrozen(key: string): boolean {
  return CATALOG_GRID_LOCKED_KEYS.includes(key as CatalogGridColumnKey);
}

export type CatalogGridSortDir = 'asc' | 'desc';

export function defaultDirForCatalogGridSort(key: CatalogGridColumnKey): CatalogGridSortDir {
  return key === 'orders' || key === 'channels' || key === 'manuals' || key === 'qc'
    ? 'desc'
    : 'asc';
}

export function catalogDisplayTitle(row: CatalogListRow): string {
  return (row.display_title || row.product_title || row.sku || '').trim();
}

export function compareCatalogGridRows(
  a: CatalogListRow,
  b: CatalogListRow,
  key: CatalogGridColumnKey,
  dir: CatalogGridSortDir,
): number {
  const mul = dir === 'desc' ? -1 : 1;
  const cmpStr = (x: string, y: string) => x.localeCompare(y, undefined, { sensitivity: 'base' }) * mul;
  const cmpNum = (x: number, y: number) => (x - y) * mul;

  switch (key) {
    case 'title':
      return cmpStr(catalogDisplayTitle(a), catalogDisplayTitle(b));
    case 'sku':
      return cmpStr(a.sku || '', b.sku || '');
    case 'inventory':
      return cmpStr(a.provider_item_id || '', b.provider_item_id || '');
    case 'channels':
      return cmpNum(a.platform_count, b.platform_count);
    case 'manuals':
      return cmpNum(a.manual_count, b.manual_count);
    case 'qc':
      return cmpNum(a.qc_step_count, b.qc_step_count);
    case 'orders':
      return cmpNum(a.order_count, b.order_count);
    case 'status': {
      const rank = (r: CatalogListRow) =>
        (r.has_pending_action ? 2 : 0) + (r.is_active ? 0 : 1) + (r.is_inventory_linked ? 0 : 0.5);
      return cmpNum(rank(a), rank(b));
    }
    case 'select':
    default:
      return cmpStr(catalogDisplayTitle(a), catalogDisplayTitle(b));
  }
}

// Shared spreadsheet chrome — same helpers as outbound OrdersGridView / Repair.
export {
  ORDERS_QUEUE_FROZEN_CELL as CATALOG_GRID_FROZEN_CELL,
  ordersQueueFrozenLeft as catalogGridFrozenLeft,
  ordersQueueGridCell as catalogGridCell,
  ordersQueueRowShellClass as catalogGridRowShellClass,
} from '@/lib/dashboard-order-row-layout';
