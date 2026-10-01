/** The per-SKU allocations LAYOUT DOCUMENT — a second set of defaults over the registered `unit-allocations` catalog. */

import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';

/** The PRODUCT default — the five facts the retired per-SKU cells painted: */
export const SKU_ALLOCATIONS_PRODUCT_LAYOUT: DataTableColumnLayout = {
  morph: 'compound',
  identityFieldId: 'unit-allocations.order',
  statusBindings: [{ fieldId: 'unit-allocations.allocated_by' }],
  subtitleBindings: [],
  amountFieldId: null,
}

/** The tableId this document serves — `PRODUCT_TABLES`' per-SKU allocations entry. */
export const SKU_ALLOCATIONS_TABLE_LAYOUT_ID = 'sku-allocations';
