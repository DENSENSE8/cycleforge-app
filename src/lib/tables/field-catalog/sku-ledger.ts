/**
 * Stock-ledger field catalog — the bindable facts of ONE `sku_stock_ledger`
 * row, as DATA.
 *
 * Off `AdminTable` 2026-09-12 (Wave D). The retired desk painted SIX
 * hand-written `AdminTableColumn` objects carrying JSX, with no header sort, no
 * Fields picker and no org binding, because that engine never grew them.
 *
 * ## Where the six retired cells landed — and why they became eight facts
 *
 * | retired cell | fact                          | home on the compound row      |
 * |--------------|-------------------------------|-------------------------------|
 * | When         | `when`                        | DATES chrome (day over clock) |
 * | Δ            | `delta`                       | `status:1`                    |
 * | Reason       | `reason`                      | the row TITLE (item cell)     |
 * | Dim          | `dimension`                   | the STATE pill                |
 * | Refs (1/3)   | `ref_order`                   | the IDENTITY chip             |
 * | Refs (2/3)   | `ref_serial_unit`             | `status:3`                    |
 * | Refs (3/3)   | `ref_receiving_line`          | catalog only — see below      |
 * | By           | `staff`                       | `status:2`, a PERSON face     |
 *
 * **The Refs cell was three facts wearing one header.** It rendered
 * `ord#12 · rl#48 · su#900`, joined with `·` and filtered for nulls, so the
 * column could not be sorted (three values), could not be searched for one ref
 * without matching the others' digits, and printed a sentence where an
 * identifier belonged. They are three columns in the table and they are three
 * facts here. The ORDER is the identity handle — it is what an operator matches
 * against a pick list or a customer email, and it is the ref most movements
 * carry — and the other two are their own tracks.
 *
 * **`staff` is a PERSON, not the `'system'` string.** The retired cell printed
 * `staff_name ?? 'system'`, which names a machine as if it were a staffer. The
 * `unit-allocations.allocated_by` ruling kept its actor as `text` precisely
 * because that feed could not tell an absent actor from a machine one; this
 * feed can — `sku_stock_ledger.staff_id` is `NULL` for a machine write — so the
 * person face draws the absence and no sentinel is invented (the same shape as
 * `audit-log.actor`).
 *
 * ## `notes` — the ninth fact
 *
 * The retired table had no notes column, so `notes` stayed off the wire until
 * something painted it. The phone take flow now writes the operator's own
 * words there (`TAKE_CUSTOM`, `src/lib/inventory/take-reason.ts`), and the item
 * cell's NOTE line paints it under the reason — chrome, like the title — so it
 * is a catalog fact (searchable, sortable, bindable) that ships unbound.
 *
 * ## Not here, and deliberately
 *
 * The refs this desk never selected (`ref_packer_log_id`, `ref_tech_log_id`,
 * `ref_sal_id`, `ref_shipment_id`) and `reason_code_id`, the typed twin of the
 * free-text `reason`, are painted by NOTHING. A fact nothing paints is not a
 * catalog entry, and `sku-ledger.test.ts` fails the day one of those names
 * appears in a `paths` here without a cell behind it.
 *
 * Resolution is `./sku-ledger-resolve.ts`, kept separate so this module stays a
 * LEAF.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const SKU_LEDGER_FIELD_CATALOG: FieldCatalog = [
  /**
   * The IDENTITY fact — the order this movement belongs to. `displayType: 'id'`
   * is what `parseSlotLayout` requires of an identity; a movement with no order
   * behind it (a cycle-count correction) dashes the chip rather than borrowing
   * one of the other refs, which would make one column mean three things again.
   */
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
  /**
   * The receiving line behind the movement — the third ref.
   *
   * Ships UNBOUND: it is a desk-internal handle owned by the receiving station
   * (the operator reading a SKU's stock history asks "which order, which unit"
   * first), and the whole skeleton leaves exactly four status slots. It stays a
   * catalog FACT, so the search box matches it and a staffer who works inbound
   * discrepancies binds it into the free slot from the Fields menu — the house
   * form of the retired `tier: 'optional'` (see `ready.ts`, `repair.ts`,
   * `my-day.ts`).
   */
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

/**
 * The PRODUCT default: WHAT moved, WHO moved it, and WHICH unit.
 *
 * The skeleton mounts WHOLE (no geometry cut — `COMPOUND_SKELETON_FILTER_DEBT`
 * is documented shrink-only), so `select · fulfillment · thumb · item · dates ·
 * state · status:N · _fill` leaves FOUR status slots under
 * `MAX_DEFAULT_VISIBLE_TRACKS`. This desk spends three, because five of its
 * nine facts are painted by chrome the skeleton already mounts:
 *
 * - `when` — the DATES chrome. Hash line = the civil day, Calendar line = the
 *   clock face with seconds, which is the precision the retired
 *   `toLocaleString()` cell had and a ledger cannot lose: two movements a
 *   heartbeat apart are a different story from two an hour apart.
 * - `reason` — the item cell's TITLE. A track repeating the title is noise.
 * - `notes` — the item cell's NOTE line, under the reason.
 * - `dimension` — the state pill (adapter chrome).
 * - `ref_order` — the identity chip (`identityFieldId`).
 *
 * All five stay catalog FACTS, so their headers sort and the search box matches
 * them, and the fourth status slot is free for `ref_receiving_line` (or for any
 * of those five as an explicit column).
 *
 * `amountFieldId: null` — a quantity movement is not money, and the compound
 * skeleton paints no amount track at all (`COMPOUND_COLUMN_KEYS`). `delta`
 * rides a `number` track, where its sign and its magnitude both read.
 *
 * Guard: `sku-ledger.test.ts` parses this against the catalog.
 */
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
