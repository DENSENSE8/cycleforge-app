/**
 * Admin › Returns field catalog — the bindable facts of one `RETURNED`
 * inventory event, as DATA.
 *
 * Off `AdminTable` 2026-09-11. The desk painted seven hand-written
 * `AdminTableColumn` objects carrying JSX: no header sort, no Fields picker, no
 * org binding, and an order reference string-concatenated into the reason cell.
 *
 * ## A SIBLING layout document, not a second vocabulary
 *
 * A returns row IS an inventory event — the same table, the same facts, read
 * through a narrower `WHERE`. So this is the receiving/incoming shape: **two
 * tableIds, one cell map** (`org-table-layouts.ts` says it in those words).
 * `admin-returns` gets its OWN document because hiding a fact on the returns
 * dock must not densify the Ledger, and because the two surfaces answer
 * different questions about the same row.
 *
 * What it does NOT get is a second name for a fact the Ledger already names.
 * Five entries below are the `inventory-events` field definitions **by
 * reference** — the same objects, the same ids, so an org that learns
 * `inventory-events.notes` on one surface has learned it on both, and a change
 * to the Ledger's vocabulary cannot drift from this one. Only what this feed
 * carries and the Ledger's wire row does not is minted here:
 *
 * | fact       | why it is new                                                 |
 * |------------|---------------------------------------------------------------|
 * | `unit`     | `PulseEventRow` identifies a unit by SERIAL; this feed has the |
 * |            | `serial_units` id and no serial number at all.                 |
 * | `tracking` | the RETURN label's `scan_token`. Not on the Ledger's wire row. |
 * | `order_ref`| `payload.order_id`. The desk spliced it into the notes string; |
 * |            | it is a separate fact and binds as one.                        |
 *
 * Resolution is `./admin-returns-resolve.ts`, kept separate so this module
 * stays a LEAF.
 */

import {
  INVENTORY_EVENTS_FIELD_CATALOG,
} from '@/lib/tables/field-catalog/inventory-events';
import type { FieldCatalog, FieldDef } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

/**
 * One `inventory-events` field, BY REFERENCE.
 *
 * Throws at module load if the Ledger ever drops the id, which is the whole
 * point: a reused field that silently became a local copy is a fork with a
 * grace period. A typo fails the build rather than painting a dashed cell.
 */
function reuse(fieldId: string): FieldDef {
  const field = INVENTORY_EVENTS_FIELD_CATALOG.find((f) => f.id === fieldId);
  if (!field) {
    throw new Error(`admin-returns: reused field '${fieldId}' is not in the inventory-events catalog`);
  }
  return field;
}

export const ADMIN_RETURNS_FIELD_CATALOG: FieldCatalog = [
  /**
   * The IDENTITY fact — the unit coming back. The desk's own docblock says
   * what this table is for ("each unit linked through to its timeline"), so
   * the row's handle is the unit, not the SKU the Ledger identifies by.
   * `displayType: 'id'` is what `parseSlotLayout` requires of an identity.
   */
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
  /**
   * The RETURN label, not an outbound one: `scan_token` is what the operator
   * typed into the intake form beside the serials. `tracking` (not `id`) is
   * the display type — the engine's tracking face carries the carrier brand
   * mark, which is exactly what a returns dock reads a 1Z… for.
   */
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

/**
 * The PRODUCT default — what an org with no override mounts, and byte-for-byte
 * the facts the retired table painted.
 *
 * Four of the seven paint on the shared row CHROME rather than on a track, so
 * binding them as tracks too would print one fact twice (the "lie by
 * repetition" rule in `compound-row-model.ts`):
 *
 * | painted fact        | where it paints on the compound row            |
 * |---------------------|------------------------------------------------|
 * | unit                | IDENTITY slot = the `fulfillment` track, top   |
 * | tracking            | the same cell's second line                    |
 * | sku                 | the ITEM cell title, linked to the SKU page    |
 * | prev status         | the STATE pill's hover (`prev → Returned`)     |
 *
 * What is left is what the chrome cannot say: WHEN it came back and WHO took
 * it in — the two status tracks — plus the reason and the order reference,
 * which are the item cell's under-title line. All four chrome-carried facts
 * stay in the catalog and an org can bind them anyway, which is exactly the
 * freedom the hand-written columns never had.
 *
 * Guard: `admin-returns.test.ts` parses this against the catalog.
 */
export const ADMIN_RETURNS_PRODUCT_LAYOUT: SlotLayout = {
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
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Returns entry. */
export const ADMIN_RETURNS_TABLE_LAYOUT_ID = 'admin-returns';
