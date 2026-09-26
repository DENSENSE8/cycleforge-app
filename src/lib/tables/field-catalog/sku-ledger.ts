/** Stock-ledger field catalog — the bindable facts of ONE `sku_stock_ledger` row, as DATA. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const SKU_LEDGER_FIELD_CATALOG: FieldCatalog = [
  /** The IDENTITY fact — the order this movement belongs to. */
  {
    id: 'sku-ledger.ref_order',
    family: 'sku-ledger',
    label: 'Order',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'ref_order_id' },
  },
  /**
   * WHY the stock moved, in whatever code the writing path recorded — painted
   * through `takeReasonLedgerLabel`, so a phone take reads `Taken · FBA`.
   */
  {
    id: 'sku-ledger.reason',
    family: 'sku-ledger',
    label: 'Reason',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'reason' },
  },
  /**
   * What somebody wrote about this movement — the operator's text for a custom
   * take. Painted by the item cell's note line, so it ships unbound.
   */
  {
    id: 'sku-ledger.notes',
    family: 'sku-ledger',
    label: 'Notes',
    displayType: 'note',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'notes' },
  },
  /**
   * HOW MUCH, signed. The sign is part of the resolved TEXT, never a colour:
   * the retired cell coloured the figure green/red AND printed the sign, and
   * tone is an accelerator while the sign is the fact.
   */
  {
    id: 'sku-ledger.delta',
    family: 'sku-ledger',
    label: 'Change',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'delta' },
  },
  /** WHICH bucket moved — `WAREHOUSE` | `BOXED`, a closed vocabulary. */
  {
    id: 'sku-ledger.dimension',
    family: 'sku-ledger',
    label: 'Dimension',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'dimension' },
  },
  /** WHO recorded it. `null` staff id ⇒ a machine write; see the docblock. */
  {
    id: 'sku-ledger.staff',
    family: 'sku-ledger',
    label: 'By',
    displayType: 'person',
    slotKinds: ['status', 'subtitle'],
    paths: { display: 'staff_name', name: 'staff_name', value: 'staff_id' },
  },
  /** The reserved/scanned unit behind the movement — one third of the old Refs cell. */
  {
    id: 'sku-ledger.ref_serial_unit',
    family: 'sku-ledger',
    label: 'Unit',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'ref_serial_unit_id' },
  },
  /** The receiving line behind the movement — the third ref. */
  {
    id: 'sku-ledger.ref_receiving_line',
    family: 'sku-ledger',
    label: 'Receiving line',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'ref_receiving_line_id' },
  },
  {
    id: 'sku-ledger.when',
    family: 'sku-ledger',
    label: 'When',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'created_at' },
  },
];

/** The PRODUCT default: */
export const SKU_LEDGER_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'sku-ledger.ref_order',
  statusBindings: [
    { fieldId: 'sku-ledger.delta' },
    { fieldId: 'sku-ledger.staff' },
    { fieldId: 'sku-ledger.ref_serial_unit' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The tableId this catalog serves — `PRODUCT_TABLES`' stock-ledger entry. */
export const SKU_LEDGER_TABLE_LAYOUT_ID = 'sku-ledger';
