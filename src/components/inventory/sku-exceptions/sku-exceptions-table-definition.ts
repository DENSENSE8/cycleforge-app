/**
 * `sku-exceptions.desk` — the SKU-exceptions queue's table definition,
 * capabilities and surface descriptor.
 *
 * Re-declares nothing: the column model, the sort law and the default
 * direction are the ENGINE's (`slot-table-columns.ts`), read from
 * {@link SKU_EXCEPTIONS_FAMILY}.
 */

import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import {
  defaultDirForSlotTableColumn,
  isSlotTableColumnSortable,
  slotTableColumnsFor,
  type SlotTableColumn,
} from '@/components/tables/compound/slot-table-columns';
import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { ProvisionalSku } from '@/lib/neon/provisional-sku-queries';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  SKU_EXCEPTIONS_FAMILY,
  SKU_EXCEPTIONS_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/sku-exceptions';

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const SKU_EXCEPTIONS_COMPOUND_COLUMNS: readonly SlotTableColumn[] = slotTableColumnsFor(
  SKU_EXCEPTIONS_FAMILY,
  SKU_EXCEPTIONS_PRODUCT_LAYOUT,
);

/**
 * A walk queue, not a bulk desk: every verb (edit, photos, count, pair) is a
 * one-record decision made in the editor, so there is no selection gutter and
 * a click opens the row.
 */
export const SKU_EXCEPTIONS_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

/** Build the descriptor from a RESOLVED column list (post-visibility). */
export function makeSkuExceptionsGridDescriptor(
  columns: readonly SlotTableColumn[],
): GridSurfaceDescriptor<ProvisionalSku, SlotTableColumn> {
  return makeGridSurfaceDescriptor<ProvisionalSku, SlotTableColumn>(
    'sku-exceptions.desk',
    columns,
    {
      isSortable: (key) => isSlotTableColumnSortable(SKU_EXCEPTIONS_FAMILY, columns, key),
      sortDescFirst: (key) =>
        defaultDirForSlotTableColumn(SKU_EXCEPTIONS_FAMILY, columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    SKU_EXCEPTIONS_GRID_CAPABILITIES,
  );
}

/** Validated at module load: a structural-law violation throws here. */
export const SKU_EXCEPTIONS_TABLE_DEFINITION = parseTableDefinition({
  id: 'sku-exceptions.desk',
  tableId: 'sku-exceptions',
  entityFamily: 'sku-exceptions',
  cellMapKey: 'sku-exceptions',
  ariaLabel: 'SKU exceptions',
  testId: 'sku-exceptions-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: SKU_EXCEPTIONS_GRID_CAPABILITIES,
  columns: SKU_EXCEPTIONS_COMPOUND_COLUMNS,
});

export const SKU_EXCEPTIONS_TABLE_BINDING: TableSurfaceBinding<
  ProvisionalSku,
  SlotTableColumn
> = {
  definition: SKU_EXCEPTIONS_TABLE_DEFINITION,
  columns: SKU_EXCEPTIONS_COMPOUND_COLUMNS,
  makeDescriptor: makeSkuExceptionsGridDescriptor,
  recordPlane: {
    kind: 'navigate',
    reason:
      'Picking a row writes ?sku=<TMP-…> on /inventory/sku-exceptions and the page swaps to that record — title, photos, per-location count and the Zoho pairing — the same URL staff share to open it.',
  },
};
