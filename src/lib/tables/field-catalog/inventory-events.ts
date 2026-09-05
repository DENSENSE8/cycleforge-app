/**
 * Inventory events field catalog — the bindable facts of one inventory event,
 * as DATA.
 *
 * The Ledger's "Recent activity" was the last hand-rolled row display in
 * Inventory: a `<ul>` of `EventRow` cards with fixed spans, no header, no
 * sort, no Fields picker, no org binding — a second table in a codebase that
 * has one. Every fact it painted is named here instead, so the SAME engine
 * paints it and an org can bind, hide or reorder the tracks like any other
 * family.
 *
 * Every entry names a fact `PulseEventRow` already carries (the enriched
 * `/api/inventory-events` row). Resolution is `./inventory-events-resolve.ts`,
 * kept separate so this module stays a LEAF.
 *
 * Inventory events is a COMPOUND morph — the same two-line WMS row To-ship
 * paints. The IDENTITY fact is
 * `inventory-events.sku` — the thing the event happened TO, and the only fact
 * here that is an `id`, which is what the engine requires of an identity
 * binding (`parseSlotLayout`). `occurred` is the first STATUS track instead: a
 * ledger is ordered by time, and a sortable date track orders it, where a
 * frozen identity column would only anchor it.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const INVENTORY_EVENTS_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'inventory-events.occurred',
    family: 'inventory-events',
    label: 'When',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'occurred_at' },
  },
  {
    id: 'inventory-events.event_type',
    family: 'inventory-events',
    label: 'Event',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'event_type' },
  },
  // A TRANSITION, not a state: the pair is the fact ("Matched → Received"), so
  // it is one bindable field rather than two that only make sense together.
  {
    id: 'inventory-events.status_change',
    family: 'inventory-events',
    label: 'Status',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { prev: 'prev_status', next: 'next_status' },
  },
  {
    id: 'inventory-events.sku',
    family: 'inventory-events',
    label: 'SKU',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'sku', title: 'product_title' },
  },
  {
    id: 'inventory-events.serial',
    family: 'inventory-events',
    label: 'Serial',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'serial_number' },
  },
  // Same shape as the status transition: a move reads `prev → next`, a put-away
  // reads the destination alone.
  {
    id: 'inventory-events.bin',
    family: 'inventory-events',
    label: 'Bin',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'bin_name', prev: 'prev_bin_name' },
  },
  {
    id: 'inventory-events.actor',
    family: 'inventory-events',
    label: 'Who',
    displayType: 'person',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'actor_name' },
  },
  {
    id: 'inventory-events.station',
    family: 'inventory-events',
    label: 'Station',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'station' },
  },
  {
    id: 'inventory-events.notes',
    family: 'inventory-events',
    label: 'Notes',
    displayType: 'note',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'notes' },
  },
];

/**
 * The PRODUCT default — what an org with no override mounts.
 *
 * Every fact the retired card painted is still painted; on the COMPOUND morph
 * five of them are painted by the shared row CHROME rather than by a track, so
 * binding those as tracks too would print the same fact twice on one row (the
 * "a due date on both lines is a lie by repetition" rule, `compound-row-model.ts`):
 *
 * | fact              | where it paints on the compound row      |
 * |-------------------|------------------------------------------|
 * | sku               | the IDENTITY slot = `fulfillment` track  |
 * | product title     | the ITEM cell's top line                 |
 * | notes             | the ITEM cell's note line                |
 * | status move       | the STATE pill (landing status + hover)  |
 * | station           | the STATE cell's next-step line          |
 *
 * What is left is what the chrome cannot say: WHEN it happened, WHAT happened,
 * which SERIAL, which BIN, and WHO did it — the five status tracks below. The
 * three chrome-carried facts stay in the catalog and an org can still bind them
 * (`status_change`, `station`, `notes`), which is exactly the freedom the card
 * never had.
 *
 * Guard: `inventory-events.test.ts` parses this against the catalog, and
 * `parseTableDefinition` enforces the dense ceiling on the materialization.
 */
export const INVENTORY_EVENTS_PRODUCT_LAYOUT: SlotLayout = {
  // COMPOUND, not sheet (2026-09-04). The first registration painted a thin
  // one-line spreadsheet, which is why the Ledger did not look like To-ship no
  // matter how its columns were named. Nothing about the FACTS changed — the
  // bindings below are the retired card's own reading order either way.
  morph: 'compound',
  identityFieldId: 'inventory-events.sku',
  statusBindings: [
    { fieldId: 'inventory-events.occurred' },
    { fieldId: 'inventory-events.event_type' },
    { fieldId: 'inventory-events.serial' },
    { fieldId: 'inventory-events.bin' },
    { fieldId: 'inventory-events.actor' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Inventory events entry. */
export const INVENTORY_EVENTS_TABLE_LAYOUT_ID = 'inventory-events';
