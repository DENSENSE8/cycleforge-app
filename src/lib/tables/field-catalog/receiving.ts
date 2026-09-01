/**
 * Receiving field catalog — the bindable Unbox / History / Testing facts, as
 * DATA. Wave 1.3's first family (`docs/todo/seller-table-program-PLAN.md` §03;
 * `docs/kill-list/07-slot-table-hand-models.md` — the `receiving` row).
 *
 * Receiving is **the compound golden**: Unbox, History and Testing all mount
 * the same compound row, so if this family stays a hand model every later
 * family copies it and the engine is optional. Its compound tracks were already
 * shared (`COMPOUND_TRACKS`), which is why this port is catalog-only — what was
 * missing is the VOCABULARY: `fieldsMenu: true` shipped on this desk with no
 * catalog behind it, which is exactly the lie the families phase ends.
 *
 * Every entry names a fact the receiving-lines feed already returns on
 * `ReceivingLineRow`; nothing here mints a column. `paths` documents the row
 * properties the resolver reads — resolution itself is `./receiving-resolve.ts`,
 * kept separate so this module stays a LEAF (the org layout API route imports
 * it server-side; the grid layout module imports it at module scope).
 *
 * ## Two facts deliberately NOT in this catalog, and why
 *
 * **The activity stamp** (the flat model's `date` track). It is not a row
 * property: which instant a row reports depends on the RAIL's activity axis —
 * Unbox reads `unboxed_at`, History `scanned_at`, Testing `tested_at`. A pure
 * `(row, fieldId)` resolver cannot answer it, and threading the axis into the
 * resolver contract for one field would fork the contract every other family
 * shares. Binding it is a deliberate later addition with an axis-aware
 * resolver, not something to smuggle in as a paths string.
 *
 * **The Zoho sync chip.** It is a state derived from several columns
 * (`zoho_synced_at`, `zoho_sync_source`, `zoho_last_modified_time`) plus the
 * connected-provider capability, and its cell already owns that derivation.
 * Naming it here without moving the derivation would give an org a column that
 * disagrees with the one beside it.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const RECEIVING_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'receiving.order',
    family: 'receiving',
    label: 'Order',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { po: 'zoho_purchaseorder_number', ref: 'zoho_reference_number' },
  },
  {
    id: 'receiving.status',
    family: 'receiving',
    label: 'Status',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'workflow_status' },
  },
  {
    id: 'receiving.qty',
    family: 'receiving',
    label: 'Qty',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { received: 'quantity_received', expected: 'quantity_expected' },
  },
  {
    id: 'receiving.price',
    family: 'receiving',
    label: 'Price',
    displayType: 'money',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'unit_price' },
  },
  {
    id: 'receiving.condition',
    family: 'receiving',
    label: 'Cond',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'condition_grade' },
  },
  // "Where the thing physically is" — the plan's §08 candidate, and on this
  // family the feed already carries it.
  {
    id: 'receiving.location',
    family: 'receiving',
    label: 'Location',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'staging_location_label' },
  },
  {
    id: 'receiving.tracking',
    family: 'receiving',
    label: 'Tracking',
    displayType: 'tracking',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'tracking_number', carrier: 'carrier' },
  },
  {
    id: 'receiving.serial',
    family: 'receiving',
    label: 'Serial',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { units: 'serials', fallbackTitle: 'item_name' },
  },
];

/**
 * The PRODUCT default receiving layout — the COMPOUND morph with **no bound
 * fact tracks**, which is byte-for-byte what Unbox, History and Testing paint
 * today: the four compound cells (order-over-tracking · title-over-note ·
 * state-over-lateness · money) and nothing else.
 *
 * That empty band is the port's honesty, not an oversight. "Reproduce, then
 * improve" — the port lands with the same columns in the same order, and every
 * fact above becomes bindable the same day without a deploy. An org that wants
 * Location or Tracking as its own track binds it; before this port that took a
 * new React column.
 *
 * `amountFieldId` is null: the compound `amount` track is chrome resolved by
 * the family adapter (`lineMoney`), not a bound slot.
 * Guard: `receiving.test.ts` parses this against the catalog.
 */
export const RECEIVING_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'receiving.order',
  statusBindings: [],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Receiving entry. */
export const RECEIVING_TABLE_LAYOUT_ID = 'receiving';
