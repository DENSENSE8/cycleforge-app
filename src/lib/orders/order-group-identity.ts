/**
 * Facts a multi-line order parent needs — tracking list, line count — from
 * the leaf rows `groupRowsBy` already folded. Pure so QueueGroupRow and tests
 * share one answer.
 */
import { resolveCarrierBrand, type CarrierBrandMeta } from '@/lib/carrier-brand';

/**
 * The minimum a row must carry to contribute boxes to a fold.
 *
 * Structural, not `ShippedOrder`, because Unbox (`ReceivingLineRow`), Pickup and
 * every other peer fold the same way and must not each grow their own copy of
 * this — the group parent is engine-owned, so its facts are too.
 */
export interface TrackingBearingRow {
  tracking_numbers?: readonly (string | null)[] | null;
  shipping_tracking_number?: string | null;
  tracking_number?: string | null;
  carrier?: string | null;
}

/** First-seen tracking numbers across every line in the fold. */
export function uniqueOrderTrackings(rows: readonly TrackingBearingRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const listed = Array.isArray(row.tracking_numbers) ? row.tracking_numbers : [];
    const fallback = [row.shipping_tracking_number, row.tracking_number];
    const source = listed.length > 0 ? listed : fallback;
    for (const raw of source) {
      const tracking = String(raw || '').trim();
      if (!tracking || seen.has(tracking)) continue;
      seen.add(tracking);
      out.push(tracking);
    }
  }
  return out;
}

/**
 * Carrier marks for a multi-line order's parent row — one dot per DISTINCT
 * carrier, plus the box count.
 *
 * ## Why dots and a count, not a chip per tracking
 *
 * The parent used to print `N tracking` over one `TrackingNumberMenuChip` per
 * number. Two problems, both operator-reported 2026-09-05:
 *
 *  1. **Height.** A row of chips is taller than the plain two-line cell every
 *     other row paints, so the parent bulged out of the sheet's rhythm. A band
 *     that is supposed to be thinner than its children read as heavier.
 *  2. **It answered the wrong question.** Staff scanning a queue do not read
 *     tracking digits; they read WHO is carrying it and HOW MANY boxes there
 *     are. Both are peripheral-vision facts, and a dot carries a carrier
 *     faster than nine characters of a chip.
 *
 * So: the distinct carriers paint as brand dots (`BrandIdentityDot`
 * `variant="ring"` + {@link carrierBrandDotPaint}) and the count says how many
 * boxes. USPS blue + UPS brown side by side is the whole story at a glance.
 *
 * ## Boxes, not lines
 *
 * A tracking number IS a box. The parent's count is therefore boxes — the word
 * staff use — never "lines", which is schema vocabulary leaking onto the floor.
 * The ITEM count is a separate fact and is not this function's job.
 */
export interface OrderCarrierBoxes {
  /** Distinct carriers, first-seen order — one dot each. */
  carriers: CarrierBrandMeta[];
  /** Distinct tracking numbers = boxes. */
  boxCount: number;
  /** Every tracking number, for the dot cluster's accessible name. */
  trackings: string[];
}

export function orderCarrierBoxes(
  rows: readonly TrackingBearingRow[],
): OrderCarrierBoxes {
  const trackings = uniqueOrderTrackings(rows);
  const carrierHint = rows.find((row) => String(row.carrier || '').trim())?.carrier ?? null;
  const seen = new Set<string>();
  const carriers: CarrierBrandMeta[] = [];
  for (const tracking of trackings) {
    const meta = resolveCarrierBrand(tracking, carrierHint);
    if (seen.has(meta.carrier)) continue;
    seen.add(meta.carrier);
    carriers.push(meta);
  }
  return { carriers, boxCount: trackings.length, trackings };
}

/** `2 boxes` / `1 box` — the parent's count face. Never "lines". */
export function orderBoxCountLabel(boxCount: number): string {
  return boxCount === 1 ? '1 box' : `${boxCount} boxes`;
}
