/** `sku-ledger.sku` — the per-SKU stock-ledger table definition, capabilities and surface descriptor. */

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

/** A READ pane over an APPEND-ONLY store. */
export const SKU_LEDGER_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  dayBands: false,
};

/** Build the descriptor from a RESOLVED column list (post-visibility), so `contentMinWidthRem` and the TanStack defs follow the tracks that… */
function makeSkuLedgerGridDescriptor(
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
const SKU_LEDGER_TABLE_DEFINITION = parseTableDefinition({
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
  /** HONEST ABSENCE, ruled rather than defaulted. */
  recordPlane: {
    kind: 'none',
    reason:
      'An append-only line on the per-SKU page. Every fact is already on the row, and its three refs name three different documents — so a row open has no single destination to pick.',
  },
};
