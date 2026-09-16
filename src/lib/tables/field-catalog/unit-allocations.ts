/**
 * Unit-allocations field catalog — the bindable facts of ONE
 * `order_unit_allocations` reservation, as DATA.
 *
 * Off a hand `<table>` in `src/components/inventory/ByUnitView.tsx` on
 * 2026-09-12 (Wave D, `HAND_HTML_TABLE_DEBT`). That markup had no header sort,
 * no Fields picker, no org binding and no empty state — it simply did not
 * render when the unit had never been allocated.
 *
 * ## ONE allocations family, two desks
 *
 * The debt entry's own words were "needs an allocations family, not a second
 * grid", and the entity is painted from two ends:
 *
 * - `/inventory?unit=` — "who is holding MY unit", with the release facts.
 * - `/inventory/health/sku/[sku]` — "what is holding my stock", with the
 *   `serial_unit_id` that says which unit, and no release facts (that feed
 *   filters `state <> 'RELEASED'`).
 *
 * Both are the same row through a narrower `SELECT`, so this catalog is the
 * UNION of their facts and {@link UnitAllocationTableRow} is the union of
 * their shapes. The per-SKU mount lands in a later brief; when it does it
 * reuses these field definitions BY REFERENCE (the `admin-returns` /
 * `inventory-events` precedent) and, if the operator wants a different default
 * density there, registers a SIBLING layout document (`sku-allocations`)
 * rather than a second vocabulary for the same facts. What it must not do is
 * mint `sku-allocations.order` beside `unit-allocations.order`.
 *
 * ## Where each painted cell landed
 *
 * The retired table painted Order · Allocated · State · Released · Reason.
 *
 * | cell      | where it paints on the compound row                          |
 * |-----------|--------------------------------------------------------------|
 * | Order     | the IDENTITY slot = the `fulfillment` track, top line        |
 * | Allocated | the DATES chrome, Hash line (and the header sorts that fact) |
 * | State     | the STATE pill (`stateLabel` / `stateTone` on the adapter)    |
 * | Released  | `status:1` — a released stamp is the second half of the story |
 * | Reason    | the under-title SUBTITLE line, not a second track            |
 *
 * `state` and `allocated` stay CATALOG fields even though the chrome paints
 * them: that is what makes the State and Dates headers sortable and the search
 * box match them, and an org may bind either as an extra column. The product
 * default leaves them unbound, because a track repeating the pill beside the
 * pill is noise (the `cycle-counts` ruling).
 *
 * Resolution is `./unit-allocations-resolve.ts`, kept separate so this module
 * stays a LEAF.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const UNIT_ALLOCATIONS_FIELD_CATALOG: FieldCatalog = [
  /**
   * The IDENTITY fact — the ORDER holding the unit. That is the handle an
   * operator matches against a pick list or a customer email, and it is the
   * one thing both desks' feeds always carry. `displayType: 'id'` is what
   * `parseSlotLayout` requires of an identity.
   */
  {
    id: 'unit-allocations.order',
    family: 'unit-allocations',
    label: 'Order',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'order_id' },
  },
  /**
   * The reserved UNIT. Unbound in the product default because the unit-detail
   * desk is already about one unit — every row would repeat the page heading.
   * It is the fact the per-SKU mount binds, and the reason this catalog is
   * shared rather than forked.
   */
  {
    id: 'unit-allocations.unit',
    family: 'unit-allocations',
    label: 'Unit',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'serial_unit_id' },
  },
  {
    id: 'unit-allocations.state',
    family: 'unit-allocations',
    label: 'State',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'state' },
  },
  {
    id: 'unit-allocations.allocated',
    family: 'unit-allocations',
    label: 'Allocated',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'allocated_at' },
  },
  {
    id: 'unit-allocations.released',
    family: 'unit-allocations',
    label: 'Released',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'released_at' },
  },
  /**
   * WHY it was released, in whatever words the releasing path wrote. Prose
   * about one row, which is what an under-title line is for — never a track
   * of truncated sentences.
   */
  {
    id: 'unit-allocations.reason',
    family: 'unit-allocations',
    label: 'Reason',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'released_reason' },
  },
  /**
   * WHO allocated it. `text`, not `person`: the retired per-SKU cell printed
   * `allocated_by_name ?? 'system'`, and "system" is not a staff member — a
   * person face would draw an avatar for a sentinel. It becomes a person field
   * the day the feed distinguishes an absent actor from a machine one (the
   * `cycle-counts.created_by` ruling).
   *
   * Ships UNBOUND: the unit-detail table never painted it, and the per-SKU
   * mount binds it when it lands.
   */
  {
    id: 'unit-allocations.allocated_by',
    family: 'unit-allocations',
    label: 'By',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'allocated_by_name' },
  },
];

/**
 * The PRODUCT default — byte-for-byte the five facts the retired hand table
 * painted, with three of them on the shared row chrome.
 *
 * ONE status track, because four of the five painted facts are chrome (order →
 * identity chip, allocated → Dates Hash, state → pill, reason → under-title)
 * and binding any of them as a track too would print one fact twice (the "lie
 * by repetition" rule in `compound-row-model.ts`).
 *
 * There is headroom: the skeleton mounts whole — `select · fulfillment ·
 * thumb · item · dates · state · status:1 · _fill` is 7 default-visible tracks
 * against `MAX_DEFAULT_VISIBLE_TRACKS` (10, `select` excluded) — so the
 * per-SKU mount can bind `unit` and `allocated_by` on top of this without
 * failing `parseTableDefinition` at module load.
 *
 * `amountFieldId: null` — a reservation has no money fact. The order's value
 * belongs to the order, not to the hold on one unit.
 *
 * Guard: `unit-allocations.test.ts` parses this against the catalog.
 */
export const UNIT_ALLOCATIONS_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'unit-allocations.order',
  statusBindings: [{ fieldId: 'unit-allocations.released' }],
  subtitleBindings: [{ fieldId: 'unit-allocations.reason' }],
  amountFieldId: null,
};

/** The tableId this catalog serves — `PRODUCT_TABLES`' allocations entry. */
export const UNIT_ALLOCATIONS_TABLE_LAYOUT_ID = 'unit-allocations';
