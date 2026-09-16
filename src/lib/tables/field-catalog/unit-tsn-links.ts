/**
 * Unit-TSN-links field catalog — the bindable facts of ONE
 * `tech_serial_numbers` cross-reference row, as DATA.
 *
 * Off the second hand `<table>` in `src/components/inventory/ByUnitView.tsx`
 * on 2026-09-12 (Wave D, `HAND_HTML_TABLE_DEBT`). Six `<th>`/`<td>` pairs with
 * no header sort, no Fields picker, no org binding and no empty state — the
 * section simply vanished when a unit had no v1 record.
 *
 * ## What this family is
 *
 * The legacy v1 audit trail. A row is one occasion the v1 tech station wrote a
 * serial down, and the desk's own header says why it is painted: "helpful when
 * joining v1 tech-station logs to v2 lifecycle". So it is a READ ledger — the
 * `kiosk-slot-events` shape: no verbs on the family, ever. Nothing on this
 * surface can edit a v1 record, and a row verb here would be inventing a write
 * path into a table the app no longer owns.
 *
 * It is NOT the `inventory-events` vocabulary wearing a different name. An
 * `inventory_events` row is a v2 lifecycle transition with prev/next status,
 * a bin and an actor; a TSN row is a v1 serial record with a station, a serial
 * TYPE and a shipment. No fact is shared beyond "it has a timestamp", which is
 * not a reason to reuse a field definition.
 *
 * ## Where each painted cell landed
 *
 * The retired table painted TSN id · When · Station · Type · Shipment ·
 * Tested by.
 *
 * | cell      | where it paints on the compound row                          |
 * |-----------|--------------------------------------------------------------|
 * | TSN id    | the IDENTITY slot = the `fulfillment` track, top line        |
 * | When      | the DATES chrome, Hash line (and the header sorts that fact) |
 * | Station   | the ITEM cell title — WHERE the record came from is the      |
 * |           | closest thing a v1 audit row has to a name                   |
 * | Type      | the STATE pill (`stateLabel` on the adapter)                  |
 * | Shipment  | `status:1`                                                    |
 * | Tested by | `status:2`                                                    |
 *
 * `station`, `serial_type` and `created` stay CATALOG fields even though the
 * chrome paints them: that is what makes the Item, State and Dates headers
 * sortable and the search box match them. The product default leaves them
 * unbound so no track repeats a fact the chrome already says.
 *
 * `fnsku` is on the wire row and was never painted — a deliberate non-goal.
 * There is no path for it here and the test pins that.
 *
 * Resolution is `./unit-tsn-links-resolve.ts`, kept separate so this module
 * stays a LEAF.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const UNIT_TSN_LINKS_FIELD_CATALOG: FieldCatalog = [
  /**
   * The IDENTITY fact — the v1 row's own id. That IS the handle: it is the
   * number an operator pastes into a v1 log query, and it is the only fact on
   * the row that is unique. `displayType: 'id'` is what `parseSlotLayout`
   * requires of an identity.
   */
  {
    id: 'unit-tsn-links.tsn',
    family: 'unit-tsn-links',
    label: 'TSN id',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'id' },
  },
  {
    id: 'unit-tsn-links.created',
    family: 'unit-tsn-links',
    label: 'When',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'created_at' },
  },
  {
    id: 'unit-tsn-links.station',
    family: 'unit-tsn-links',
    label: 'Station',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'station_source' },
  },
  {
    id: 'unit-tsn-links.serial_type',
    family: 'unit-tsn-links',
    label: 'Type',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'serial_type' },
  },
  {
    id: 'unit-tsn-links.shipment',
    family: 'unit-tsn-links',
    label: 'Shipment',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'shipment_id' },
  },
  /**
   * WHO tested it. `text`, not `person`: this feed carries a NAME off a v1
   * join and no staff id, so a person face would have nothing to resolve an
   * avatar from — and a v1 tester may not be current staff at all.
   */
  {
    id: 'unit-tsn-links.tested_by',
    family: 'unit-tsn-links',
    label: 'Tested by',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'tested_by_name' },
  },
];

/**
 * The PRODUCT default — byte-for-byte the six facts the retired hand table
 * painted, four of them on the shared row chrome.
 *
 * TWO status tracks: `select · fulfillment · thumb · item · dates · state ·
 * status:1 · status:2 · _fill` is 8 default-visible tracks (the `select`
 * gutter is never counted) against `MAX_DEFAULT_VISIBLE_TRACKS` (10). The
 * skeleton mounts whole — `COMPOUND_SKELETON_FILTER_DEBT` is documented
 * shrink-only, so a new desk does not cut chrome geometry to taste.
 *
 * No subtitle binding: the v1 row has no prose. The adapter's `note` names the
 * shipment in words for the one case where the track is hidden, and an org
 * that wants a second line binds one.
 *
 * `amountFieldId: null` — a v1 serial record carries no money.
 *
 * Guard: `unit-tsn-links.test.ts` parses this against the catalog.
 */
export const UNIT_TSN_LINKS_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'unit-tsn-links.tsn',
  statusBindings: [
    { fieldId: 'unit-tsn-links.shipment' },
    { fieldId: 'unit-tsn-links.tested_by' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The tableId this catalog serves — `PRODUCT_TABLES`' TSN-links entry. */
export const UNIT_TSN_LINKS_TABLE_LAYOUT_ID = 'unit-tsn-links';
