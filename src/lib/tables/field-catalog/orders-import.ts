/**
 * Order-import-staging field catalog — the bindable staged-row facts, as DATA.
 * Wave 1.4's tenth family and the last of the wave
 * (`docs/todo/seller-table-program-PLAN.md` §03;
 * `docs/kill-list/07-slot-table-hand-models.md` — the `orders-import` row:
 * "own prefs bucket ON PURPOSE (hiding a staging column must not densify live
 * To-ship). That is a separate `tableId`, which slots already give you. The
 * hand array is still a frozen layout for that id.").
 *
 * Every entry names a fact `OrderImportRowView` already carries. Resolution is
 * `./orders-import-resolve.ts`, kept separate so this module stays a LEAF.
 *
 * Orders-import is a SHEET morph. `orders-import.order` is the IDENTITY fact —
 * the order number the whole import is keyed on — which the structural frozen
 * Order track paints.
 *
 * **`status` is structural, not a catalog field.** The Ready / Action-required
 * triage state IS what this surface is for: a staffer who could unbind it would
 * be looking at an import queue that no longer says which rows block the
 * commit. It carries no `hideKey` for exactly that reason, and it stays in the
 * skeleton — the same rule that keeps Warranty's ticket button and Ready's
 * Stage-FBA escape out of their catalogs.
 *
 * Deliberately absent too: `itemNumber`, `itemTitle`, `weightOz`,
 * `assigneeTech` and `assigneePacker`. The row type marks each of them "not on
 * a grid TRACK — carried for `searchValues` only". They are find-bar targets,
 * and binding one would put a column on a fact the import pipeline does not
 * treat as displayable.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const ORDERS_IMPORT_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'orders-import.order',
    family: 'orders-import',
    label: 'Order number',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { value: 'orderNumber' },
  },
  {
    id: 'orders-import.sku',
    family: 'orders-import',
    label: 'SKU',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'sku' },
  },
  {
    id: 'orders-import.qty',
    family: 'orders-import',
    label: 'Quantity',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'quantity' },
  },
  {
    id: 'orders-import.customer',
    family: 'orders-import',
    label: 'Customer',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'customerName' },
  },
  {
    id: 'orders-import.tracking',
    family: 'orders-import',
    label: 'Tracking',
    displayType: 'tracking',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'trackingNumber' },
  },
  {
    id: 'orders-import.platform',
    family: 'orders-import',
    label: 'Platform',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'platform' },
  },
];

/**
 * The PRODUCT default staging layout — visual parity with the retired hand
 * model (`select · order · status · sku · qty · customer · tracking ·
 * platform`), the whole set, which is what a staffer checking an import needs
 * before committing it.
 * Guard: `orders-import.test.ts` parses this against the catalog.
 */
export const ORDERS_IMPORT_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'sheet',
  identityFieldId: 'orders-import.order',
  statusBindings: [
    { fieldId: 'orders-import.sku' },
    { fieldId: 'orders-import.qty' },
    { fieldId: 'orders-import.customer' },
    { fieldId: 'orders-import.tracking' },
    { fieldId: 'orders-import.platform' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — the staging grid's own prefs bucket. */
export const ORDERS_IMPORT_TABLE_LAYOUT_ID = 'orders-import';
