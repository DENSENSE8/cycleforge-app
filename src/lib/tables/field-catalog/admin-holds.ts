/**
 * Admin › Holds field catalog — the bindable facts of ONE quarantined unit.
 *
 * Off `AdminTable` 2026-09-12 (Wave D). The retired desk painted SEVEN
 * hand-written `AdminTableColumn` objects carrying JSX, one of them a two-line
 * identity stack and one of them a `<form>` — no header sort, no Fields picker
 * and no org binding, because that engine never grew them.
 *
 * ## Where the facts landed
 *
 * | retired cell        | fact                   | home on the compound row     |
 * |---------------------|------------------------|------------------------------|
 * | Unit (`#{id}` half) | `unit`                 | the IDENTITY handle          |
 * | Unit (serial half)  | `serial`               | the row TITLE (item cell)    |
 * | SKU                 | `sku`                  | `status:1`                   |
 * | Restore to          | `restore_status`       | the STATE pill               |
 * | Reason              | `hold_reason`          | bound SUBTITLE               |
 * | Held at             | `held_at`              | DATES chrome (day over clock)|
 * | By                  | `held_by`              | `status:2`, a PERSON face    |
 * | Release             | — not a fact           | a ROW VERB + a stage plane   |
 *
 * Three of those are decisions rather than transcription:
 *
 * **The Unit cell was TWO facts, and it splits.** It printed `#{id} ·
 * {serial_number}` under one header. The id is the row's HANDLE — it is what
 * `/inventory?unit=<id>` is keyed by, and a compound row has exactly one
 * identity chip — so it is the identity field. The serial is what is physically
 * printed on the thing in the quarantine bin, and that is what an operator
 * reads first, so it is the TITLE. Two painted tracks means two facts: a title
 * with no fact behind it would be a DATA header with a dead sort
 * (`SLOT_TABLE_PAINT_LAW.headerSort`).
 *
 * **`restore_status` is the state pill, even though it is not this row's
 * state.** Every row on this feed is `ON_HOLD` — that is the `WHERE` clause, so
 * a pill repeating it would be a column of one constant word. The fact that
 * VARIES, and the one an operator needs before releasing, is where the unit
 * goes back to. The pill carries it and the hover says what it means, so the
 * word `STOCKED` cannot be misread as "this unit is in stock".
 *
 * **`release` is not here.** A verb is not a bindable fact
 * (`VERBS_BIND_TO_FIELDS`); it is declared once in
 * `components/inventory/holds-grid/admin-holds-verbs.ts` and it opens
 * `HoldReleasePlane` because its payload takes a parameter (the restore-status
 * override). Nothing in this repo sets `capabilities.inCellEdit`, so a
 * `<select>` inside a compound row is not a thing that exists.
 *
 * ## Not here, and deliberately
 *
 * `condition_grade` and the UNIT's own `notes` are selected by `loadHeldUnits`
 * and painted by nothing — see `lib/inventory/held-unit-row.ts`, where they
 * stop. A fact nothing paints is not a catalog entry, and `admin-holds.test.ts`
 * fails the day either name appears in a `paths` here.
 *
 * ## Not `UNITS_FIELD_CATALOG`, either
 *
 * This is the quarantine queue, not the units desk. `hold_reason`,
 * `restore_status`, `held_at` and `held_by` come from a LATERAL join onto the
 * unit's most recent `HELD` inventory_event; `serial_units` carries none of
 * them, so the units vocabulary cannot name them and reusing it would mean
 * minting four foreign fields into another family's catalog.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const ADMINHOLDS_FIELD_CATALOG: FieldCatalog = [
  { id: 'admin-holds.unit', family: 'admin-holds', label: 'Unit', displayType: 'id', slotKinds: ['identity', 'status', 'subtitle'], paths: { value: 'id' } },
  { id: 'admin-holds.serial', family: 'admin-holds', label: 'Serial', displayType: 'id', slotKinds: ['identity', 'status', 'subtitle'], paths: { value: 'serial_number' } },
  { id: 'admin-holds.sku', family: 'admin-holds', label: 'SKU', displayType: 'id', slotKinds: ['status', 'subtitle'], paths: { value: 'sku' } },
  { id: 'admin-holds.restore_status', family: 'admin-holds', label: 'Restore to', displayType: 'tag', slotKinds: ['status', 'subtitle'], paths: { value: 'restore_status' } },
  { id: 'admin-holds.hold_reason', family: 'admin-holds', label: 'Reason', displayType: 'note', slotKinds: ['status', 'subtitle'], paths: { value: 'hold_reason' } },
  { id: 'admin-holds.held_at', family: 'admin-holds', label: 'Held at', displayType: 'date', slotKinds: ['status', 'subtitle'], paths: { value: 'held_at' } },
  { id: 'admin-holds.held_by', family: 'admin-holds', label: 'Held by', displayType: 'person', slotKinds: ['status', 'subtitle'], paths: { display: 'held_by_name', name: 'held_by_name', value: 'held_by_staff_id' } },
];

/**
 * The PRODUCT default: WHAT is quarantined and WHO quarantined it.
 *
 * The skeleton mounts WHOLE (no geometry cut — `COMPOUND_SKELETON_FILTER_DEBT`
 * is documented shrink-only), so `fulfillment · thumb · item · dates · state ·
 * status:N · _fill` leaves FOUR status slots under
 * `MAX_DEFAULT_VISIBLE_TRACKS` (10, `select` never counted). This desk binds
 * only two of them, because four of the seven facts are painted by chrome the
 * skeleton already mounts:
 *
 * - `unit` — the identity chip (`identityFieldId`).
 * - `serial` — the item cell's TITLE. A track repeating the title is noise.
 * - `restore_status` — the state pill (adapter chrome).
 * - `held_at` — the DATES chrome. Hash line = the civil day, Calendar line =
 *   the clock; a bound track beside that would print the same instant twice.
 *
 * `hold_reason` is the item cell's SECOND LINE, not a track. It is free text an
 * operator typed ("damaged in handling", "customer dispute") — the retired cell
 * typed it `longtext` — and what belongs under a title is what somebody wrote
 * about that specific row. A 10rem track would clip it to three words.
 *
 * All of them stay catalog FACTS, so their headers sort and the search box
 * matches them, and the two free status slots are where a staffer who wants
 * `held_at` or `restore_status` as an explicit column binds it — the house form
 * of the retired `tier: 'optional'` (see `ready.ts`, `repair.ts`, `my-day.ts`).
 *
 * `amountFieldId: null` — a held unit has no money fact. Its value is the SKU's
 * and this desk is not the place that answers for it.
 */
export const ADMINHOLDS_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'admin-holds.unit',
  statusBindings: [
    { fieldId: 'admin-holds.sku' },
    { fieldId: 'admin-holds.held_by' },
  ],
  subtitleBindings: [{ fieldId: 'admin-holds.hold_reason' }],
  amountFieldId: null,
};

export const ADMINHOLDS_TABLE_LAYOUT_ID = 'admin-holds';
