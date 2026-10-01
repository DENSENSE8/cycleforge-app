/** Admin › Returns field catalog — the bindable facts of one `RETURNED` inventory event, as DATA. */

import {
  INVENTORY_EVENTS_FIELD_CATALOG,
} from '@/lib/tables/field-catalog/inventory-events';
import type { FieldCatalog, FieldDef } from '@/lib/tables/field-catalog/types';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';

/** One `inventory-events` field, BY REFERENCE. */
function reuse(fieldId: string): FieldDef {
  const field = INVENTORY_EVENTS_FIELD_CATALOG.find((f) => f.id === fieldId);
  if (!field) {
    throw new Error(`admin-returns: reused field '${fieldId}' is not in the inventory-events catalog`);
  }
  return field;
}

export const ADMIN_RETURNS_FIELD_CATALOG: FieldCatalog = [
  /** The IDENTITY fact — the unit coming back. */
  {
    id: 'admin-returns.unit',
    family: 'admin-returns',
    label: 'Unit',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'serial_unit_id' },
  },
  reuse('inventory-events.sku'),
  reuse('inventory-events.occurred'),
  // The move the unit made. On THIS feed the landing end is `RETURNED` by
  // construction (the query's own WHERE), so the varying end is `prev_status`
  // alone — see the resolver.
  reuse('inventory-events.status_change'),
  /** The RETURN label, not an outbound one: */
  {
    id: 'admin-returns.tracking',
    family: 'admin-returns',
    label: 'Tracking',
    displayType: 'tracking',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'scan_token' },
  },
  reuse('inventory-events.notes'),
  /**
   * The order this unit came back FROM. The retired cell printed it inside the
   * reason string (`notes · ord#12`), which made one cell two facts and made
   * the order unbindable, unsortable and unsearchable on its own.
   */
  {
    id: 'admin-returns.order_ref',
    family: 'admin-returns',
    label: 'Order',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'order_id' },
  },
  reuse('inventory-events.actor'),
];

/** The PRODUCT default — what an org with no override mounts, and byte-for-byte the facts the retired table painted. */
export const ADMIN_RETURNS_PRODUCT_LAYOUT: DataTableColumnLayout = {
  morph: 'compound',
  identityFieldId: 'admin-returns.unit',
  statusBindings: [
    { fieldId: 'inventory-events.occurred' },
    { fieldId: 'inventory-events.actor' },
  ],
  subtitleBindings: [
    { fieldId: 'inventory-events.notes' },
    { fieldId: 'admin-returns.order_ref' },
  ],
  amountFieldId: null,
}

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Returns entry. */
export const ADMIN_RETURNS_TABLE_LAYOUT_ID = 'admin-returns';
