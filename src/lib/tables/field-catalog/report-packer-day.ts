/**
 * Packer-day report field catalog — the bindable facts of ONE PACK
 * (`/reports?tab=packer`).
 *
 * Sibling of `report-staff-day` / `report-velocity` / `report-dead-stock`,
 * built the same way: facts first, then the PRODUCT layout that binds the ones
 * the compound skeleton does not already paint.
 *
 * ## Why this family exists at all
 *
 * The packer read used to live on `/operations?mode=analytics` as a hand-rolled
 * `<table>` under a strip of KPI tiles. The operator's verdict (2026-09-16):
 * *"I cannot trust any of the information within the display."* That was
 * earned — the tiles compared a partial PST day against a whole one, three of
 * their deltas were hardcoded zero, and the labels named units the queries did
 * not count. A scalar with no drill path can rot for months without anyone
 * noticing.
 *
 * A REGISTERED FAMILY cannot rot the same way, and that is the whole argument
 * for the move: every row is one pack scan (`station_activity_logs.id`), so a
 * number here is always a row you can point at, count, sort, search and export.
 *
 * ## Where the facts land
 *
 * | fact          | home on the compound row                        |
 * |---------------|-------------------------------------------------|
 * | `packer`      | the IDENTITY handle — "what did Tuan pack"       |
 * | `product`     | the row TITLE (item cell)                       |
 * | `packed_at`   | the DATES chrome's Hash line (clock time)       |
 * | (basis)       | the STATE pill — `Set` / `Rules` / `Default`    |
 * | `item_number` | a status track                                  |
 * | `sku`         | a status track                                  |
 * | `minutes`     | a status track — the SKU's time to pack         |
 * | `tier`        | a status track (optional)                       |
 * | `order_ref`   | the compound row's tracking handle              |
 *
 * `minutes` resolves to DIGITS and `packed_at` to the ABSOLUTE INSTANT, never
 * a formatted face — a resolver carrying " min" would sort lexically and a
 * relative date would sort against `now`.
 *
 * ## `basis` is a first-class fact, not decoration
 *
 * It is the answer to "can I trust this minute count": `Set` means a human set
 * that SKU's standard on its product record, `Rules` means `classifyPackTier`
 * guessed it from the title, `Default` means the pack never resolved to a
 * catalog SKU and carries the fallback. On 2026-09-15 that was 49 of 51 packs
 * — which is the real finding the old KPI tile hid behind a single "264 min".
 * Sorting this column IS the pairing work queue.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const REPORT_PACKER_DAY_FIELD_CATALOG: FieldCatalog = [
  /**
   * Packer attribution — a `person`, bound to status or subtitle tracks.
   *
   * `paths` mirrors every peer person field (`audit-log.actor`,
   * `auth-sessions.staff`): `display`/`name` carry the NAME the face prints,
   * `value` carries the STAFF ID the avatar colours itself from. Both halves
   * are load-bearing — name alone printed "—", and id alone drew a bubble with
   * no label.
   */
  {
    id: 'report-packer-day.packer',
    family: 'report-packer-day',
    label: 'Packer',
    displayType: 'person',
    slotKinds: ['status', 'subtitle'],
    paths: { display: 'packerName', name: 'packerName', value: 'packerStaffId' },
  },
  {
    id: 'report-packer-day.product',
    family: 'report-packer-day',
    label: 'Product',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'productTitle' },
  },
  /** The compound DATES chrome's fact — the instant the pack scan landed. */
  {
    id: 'report-packer-day.packed_at',
    family: 'report-packer-day',
    label: 'Packed at',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'packedAt' },
  },
  {
    id: 'report-packer-day.item_number',
    family: 'report-packer-day',
    label: 'Item #',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'itemNumber' },
  },
  {
    id: 'report-packer-day.sku',
    family: 'report-packer-day',
    label: 'SKU',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'sku' },
  },
  /** The standard this pack was weighted at, in whole minutes. */
  {
    id: 'report-packer-day.minutes',
    family: 'report-packer-day',
    label: 'Time to pack',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'estimatedMinutes' },
  },
  {
    id: 'report-packer-day.tier',
    family: 'report-packer-day',
    label: 'Tier',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'packTier' },
  },
  /** Where the standard came from — the trust fact. See the module doc. */
  {
    id: 'report-packer-day.basis',
    family: 'report-packer-day',
    label: 'Basis',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'tierSource' },
  },
  /**
   * The ORDER NUMBER — the identity fact, and what the Id chip's first line
   * paints. Separate from {@link order_ref} on purpose: they are two handles,
   * and binding the tracking to identity is what made the chip print the same
   * digits on both of its lines (operator 2026-09-16).
   */
  {
    id: 'report-packer-day.order_number',
    family: 'report-packer-day',
    label: 'Order #',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'orderNumber' },
  },
  /** The carrier tracking / raw scan ref — the chip's SECOND line. */
  {
    id: 'report-packer-day.order_ref',
    family: 'report-packer-day',
    label: 'Tracking',
    displayType: 'tracking',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'trackingOrScanRef' },
  },
];

/**
 * The PRODUCT default: one day's packs, newest first.
 *
 * The IDENTITY slot is `order_number` — the operator-facing handle for one
 * pack, and the fact the Id chip's first line paints. The tracking is the
 * chip's SECOND line and is a separate catalog fact (`order_ref`); binding the
 * tracking to identity printed the same digits twice. The packer is a status
 * TRACK rather than the identity: a packer's name repeats down dozens of rows,
 * and an identity chip that repeats is a grouping label wearing an id's
 * clothes.
 *
 * Chrome paints three facts without a binding — `product` (the TITLE), the
 * basis pill (adapter), `packed_at` (DATES Hash) — so the desk binds the four
 * the chrome cannot reach: who packed it, the item number, the SKU, and the
 * time to pack.
 *
 * `tier` stays UNBOUND rather than absent: it is in the catalog, so the Fields
 * menu offers it, but it is derivable from the minutes (`tierForMinutes`), and
 * painting both by default would be one fact twice.
 *
 * `amountFieldId: null` — no money on a pack scan.
 */
export const REPORT_PACKER_DAY_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'report-packer-day.order_number',
  statusBindings: [
    { fieldId: 'report-packer-day.packer' },
    { fieldId: 'report-packer-day.item_number' },
    { fieldId: 'report-packer-day.sku' },
    { fieldId: 'report-packer-day.minutes' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Packer-day entry. */
export const REPORT_PACKER_DAY_TABLE_LAYOUT_ID = 'report-packer-day';
