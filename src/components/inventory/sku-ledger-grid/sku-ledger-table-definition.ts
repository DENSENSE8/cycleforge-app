/**
 * `sku-ledger.sku` — the per-SKU stock-ledger table definition, capabilities
 * and surface descriptor.
 *
 * Re-declares nothing: columns + capabilities are the family SoT by reference,
 * and the canonical columns are the product-default MATERIALIZATION
 * (`SKU_LEDGER_COMPOUND_COLUMNS`), never a hand array.
 */

import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { SkuLedgerTableRow } from '@/lib/inventory/sku-ledger-row';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  SKU_LEDGER_COMPOUND_COLUMNS,
  defaultDirForSkuLedgerColumn,
  isSkuLedgerColumnSortable,
  type SkuLedgerGridColumn,
} from './sku-ledger-grid-layout';

/**
 * A READ pane over an APPEND-ONLY store. `sku_stock_ledger` is authoritative
 * for SKU quantities (`sku_stock` is trigger-maintained from `SUM(delta)`), so
 * an entry is never edited or deleted — a correction is a new movement, written
 * by the station that counted it. There is no verb here and `multiSelect` stays
 * off: the gutter checkbox would be a control with no verb behind it.
 */
export const SKU_LEDGER_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

/**
 * Build the descriptor from a RESOLVED column list (post-visibility), so
 * `contentMinWidthRem` and the TanStack defs follow the tracks that actually
 * render. `columns` is REQUIRED: a module-constant default is the
 * `grid-default` debt the discover scanner deletes.
 */
export function makeSkuLedgerGridDescriptor(
  columns: readonly SkuLedgerGridColumn[],
): GridSurfaceDescriptor<SkuLedgerTableRow, SkuLedgerGridColumn> {
  return makeGridSurfaceDescriptor<SkuLedgerTableRow, SkuLedgerGridColumn>(
    'sku-ledger.sku',
    columns,
    {
      isSortable: (key) => isSkuLedgerColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForSkuLedgerColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    SKU_LEDGER_GRID_CAPABILITIES,
  );
}

/**
 * Validated at module load: a definition that violates a structural law throws
 * here rather than painting a broken grid.
 */
export const SKU_LEDGER_TABLE_DEFINITION = parseTableDefinition({
  id: 'sku-ledger.sku',
  tableId: 'sku-ledger',
  entityFamily: 'sku-ledger',
  cellMapKey: 'sku-ledger',
  ariaLabel: 'Stock ledger',
  testId: 'sku-ledger-grid-body',
  surface: 'sheet',
  // The last hundred movements of one SKU can all land inside a single busy
  // afternoon, so a sticky day band would mostly be one band over everything —
  // and the Dates chrome already prints the day on every row.
  showDayHeaders: false,
  capabilities: SKU_LEDGER_GRID_CAPABILITIES,
  columns: SKU_LEDGER_COMPOUND_COLUMNS,
});

export const SKU_LEDGER_TABLE_BINDING: TableSurfaceBinding<
  SkuLedgerTableRow,
  SkuLedgerGridColumn
> = {
  definition: SKU_LEDGER_TABLE_DEFINITION,
  columns: SKU_LEDGER_COMPOUND_COLUMNS,
  makeDescriptor: makeSkuLedgerGridDescriptor,
  /**
   * HONEST ABSENCE, ruled rather than defaulted. The retired table linked
   * nowhere — every ref was plain mono text — and a ledger ENTRY has no record
   * of its own to open: it is an immutable line whose every fact is already on
   * the row. Its three refs point at three DIFFERENT documents (an order, a
   * receiving line, a unit), so "open the row" has no single answer here; the
   * unit reach-through that the allocations pane above it offers is a
   * one-to-one row → record relationship this one does not have.
   *
   * It becomes `navigate` the day a movement has one canonical destination.
   */
  recordPlane: {
    kind: 'none',
    reason:
      'An append-only line on the per-SKU page. Every fact is already on the row, and its three refs name three different documents — so a row open has no single destination to pick.',
  },
};
