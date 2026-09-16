/**
 * `LocationStockTableRow → CompoundRowView` — pure, strings and enums, no JSX.
 *
 * The family's ONLY contribution to how a stock row paints. Every fact it does
 * not name here is a bound SLOT resolved through `location-stock-resolve.ts`.
 *
 * ## What the compound row says about one (location, sku) pair
 *
 * - IDS — the LOCATION, through the house coalesce
 *   ({@link locationStockLocationLabel}). That is the handle a picker walks to
 *   and the string a gun reads. There is no tracking number on a shelf, so the
 *   cell's second line stays empty rather than borrowing one.
 * - TITLE — the PRODUCT, with the count riding UNDER it as the line qty. The
 *   qty is NOT set here: it is a bound subtitle fact, and the engine's line-qty
 *   law (`slotSubtitlePartsFor` → `lineQtySubtitlePart`) owns its face and its
 *   position, so every peer counts in the same ink. `subtitleParts` is left
 *   undefined precisely so the engine supplies it.
 * - NOTE — nothing. The title already falls back to the SKU when the catalog
 *   has no row, and the SKU is its own track; a note line repeating either
 *   would be a lie by repetition.
 * - STATE — the stock LEVEL, from {@link locationStockLevel}: the same word the
 *   `bins` overview publishes, derived from this row's own qty/min/max. Tone is
 *   never the fact — `Low` and `Over` are the two words a replenisher acts on,
 *   so they carry the alert tone and the word carries the meaning.
 * - DATES — Hash line = the civil day of the last count, Calendar line = the
 *   clock. A pair that was never counted leaves both empty rather than
 *   inventing an age.
 *
 * There is no money, no photo and no deadline on a shelf row; all three stay
 * null and the shared cells paint the honest empty face.
 */

import { format } from 'date-fns';
import {
  compoundIdentityFace,
  type CompoundRowView,
  type CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import type { LocationStockTableRow } from '@/lib/inventory/location-stock-row';
import { locationStockRowId } from '@/lib/inventory/location-stock-row';
import {
  locationStockItemLabel,
  locationStockLevel,
  locationStockLocationLabel,
  type LocationStockLevel,
} from '@/lib/tables/field-catalog/location-stock-resolve';

/**
 * Level → tone. `Low` and `Over` are the two a human has to do something about
 * (replenish, spill into another bin); `Stocked` is the ordinary case.
 */
const LEVEL_TONE: Readonly<Record<LocationStockLevel, CompoundStateTone>> = {
  Low: 'alert',
  Over: 'alert',
  Stocked: 'neutral',
};

export function locationStockCompoundView(row: LocationStockTableRow): CompoundRowView {
  const level = locationStockLevel(row);
  const counted = row.last_counted ? new Date(row.last_counted) : null;
  const instant = counted && !Number.isNaN(counted.getTime()) ? counted : null;
  const day = instant
    ? { label: format(instant, 'MMM d'), dateKey: format(instant, 'yyyy-MM-dd') }
    : null;
  const clock = instant ? format(instant, 'h:mm a') : null;
  const stamp = day && clock ? `Counted ${day.label} · ${clock}` : null;

  return {
    // A pair is the entity, so BOTH halves are the row key — a location holds
    // many SKUs and a SKU sits in many locations.
    id: locationStockRowId(row),
    // The catalog photo, so the thumb gutter paints the ITEM. `null` is honest
    // absence — the shared cell paints its typed placeholder rather than a
    // broken `<img>`, which is why no fallback URL is invented here.
    thumbUrl: row.image_url,
    title: locationStockItemLabel(row),
    note: null,
    // The Id track carries THIS family's handle, not an order: `identityFace`
    // paints it plainly and copyably, without the marketplace brand dot and
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
    // column is Id product-wide).
    identityFace: compoundIdentityFace(locationStockLocationLabel(row), 'Location'),
    // …and the SKU UNDER it (operator 2026-09-15: "the SKU is an id and it
    // should display under the location id most left column"). The Id track has
    // always stacked two identifiers; on a shelf row they are the place and the
    // product, and both are handles a human reads back to a gun.
    identitySubFace: compoundIdentityFace(row.sku, 'SKU'),
    orderId: null,
    // `tracking` stays null BECAUSE `identitySubFace` owns line 2 — a family
    // must not set both, and a shelf has no carrier number anyway.
    tracking: null,
    // No marketplace and no carrier behind a shelf: the identity chip must not
    // borrow a brand dot from another family's vocabulary.
    platformValue: null,
    carrier: null,
    stateLabel: level,
    stateTone: LEVEL_TONE[level],
    orderedAt: day ? { label: day.label, tip: stamp ?? day.label, dateKey: day.dateKey } : null,
    // Explicit Hash hover SoT — this family names the chip, so the engine must
    // not prefix "Start date" onto a line that is a count stamp.
    //
    // Named UNCONDITIONALLY, unlike its `sku-bins` sibling: this was a real
    // defect on the desk (2026-09-15). `bin_contents.last_counted` is NULL for
    // most pairs on a floor that has never run a cycle count, and a spread that
    // only supplied the hover when a stamp existed let the engine's default
    // wording through — so hovering the empty `--` on a stock row said
    // "Start date", which is a shipping word for a shelf that has no date at
    // all. The absent case is the case that needed the name.
    startedHover: stamp ?? 'Never counted',
    // Calendar line = the clock face. Not a deadline: `days: 0` / not overdue
    // is the honest answer for a desk with no due dates at all.
    delay: clock ? { days: 0, overdue: false, faceLabel: clock } : null,
    delayTip: stamp ?? 'Never counted',
    amount: null,
  };
}
