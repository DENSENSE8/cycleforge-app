/** Client-safe SoT for the **directed putaway target** — "put this product HERE" — shown at the top of the station Locations leaf. */

/** Where a suggestion came from. Strongest first. */
export type PutawaySuggestionBasis = 'sku_history' | 'recent_stage';

/** Enough of a `locations` row to paint {@link PlacementSummary} and place on it. */
export interface PutawaySuggestionLocation {
  id: number;
  name: string;
  room: string | null;
  barcode: string | null;
  row_label: string | null;
  col_label: string | null;
  zone_letter: string | null;
  bin_type: string | null;
  capacity: number | null;
  description: string | null;
}

export interface PutawaySuggestion {
  location: PutawaySuggestionLocation;
  basis: PutawaySuggestionBasis;
  /** How many of the sampled stages landed on {@link location}. */
  hits: number;
  /** How many prior stages were sampled to reach it. */
  sampled: number;
  /** SKU the history was read over — `null` on `recent_stage`. */
  sku: string | null;
}

/** How many prior stages of the same SKU the ranking reads. */
export const SKU_HISTORY_SAMPLE = 10;

export interface SkuHistoryRow {
  locationId: number;
}

/** Rank a NEWEST-FIRST list of prior stages of one SKU. */
export function pickSkuHistoryWinner(
  rows: readonly SkuHistoryRow[],
): { locationId: number; hits: number; sampled: number } | null {
  if (rows.length === 0) return null;
  const counts = new Map<number, number>();
  for (const r of rows) {
    if (!(r.locationId > 0)) continue;
    counts.set(r.locationId, (counts.get(r.locationId) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  const sampled = rows.filter((r) => r.locationId > 0).length;
  let winner = -1;
  let hits = 0;
  // Walk newest-first so the first id to reach the max count keeps it — that
  // IS the recency tiebreak, without a second sort key to get wrong.
  for (const r of rows) {
    const c = counts.get(r.locationId) ?? 0;
    if (c > hits) {
      hits = c;
      winner = r.locationId;
    }
  }
  if (winner <= 0) return null;
  return { locationId: winner, hits, sampled };
}

/**
 * The two strings the leaf paints: the eyebrow above the address, and the
 * BASIS line under it. The basis is not optional copy — see the module note.
 */
export function describePutawaySuggestion(s: {
  basis: PutawaySuggestionBasis;
  hits: number;
  sampled: number;
  sku: string | null;
}): { eyebrow: string; basis: string } {
  if (s.basis === 'sku_history') {
    const sku = (s.sku || '').trim();
    const subject = sku ? `${sku}` : 'this product';
    const basis =
      s.sampled <= 1
        ? `The last ${subject} went here.`
        : `${s.hits} of the last ${s.sampled} ${subject} went here.`;
    return { eyebrow: 'Put this product here', basis };
  }
  return {
    eyebrow: 'Put this product here',
    basis: 'No history for this SKU yet — this is where the floor staged last.',
  };
}
