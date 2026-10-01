/** Admin drift-alert field catalog — the bindable facts of ONE open `stock_alerts` DRIFT row. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';

export const ADMIN_DRIFT_ALERTS_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'admin-drift-alerts.sku',
    family: 'admin-drift-alerts',
    label: 'SKU',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'sku' },
  },
  {
    id: 'admin-drift-alerts.worst_delta',
    family: 'admin-drift-alerts',
    label: 'Worst |Δ|',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'qty_at_trigger' },
  },
  {
    id: 'admin-drift-alerts.triggered',
    family: 'admin-drift-alerts',
    label: 'Triggered',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'triggered_at' },
  },
  {
    id: 'admin-drift-alerts.detail',
    family: 'admin-drift-alerts',
    label: 'Detail',
    displayType: 'note',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'notes' },
  },
];

/** The PRODUCT default: */
export const ADMIN_DRIFT_ALERTS_PRODUCT_LAYOUT: DataTableColumnLayout = {
  morph: 'compound',
  identityFieldId: 'admin-drift-alerts.sku',
  statusBindings: [],
  subtitleBindings: [],
  amountFieldId: null,
}

/** The one tableId this catalog serves — `PRODUCT_TABLES`' drift-alerts entry. */
export const ADMIN_DRIFT_ALERTS_TABLE_LAYOUT_ID = 'admin-drift-alerts';
