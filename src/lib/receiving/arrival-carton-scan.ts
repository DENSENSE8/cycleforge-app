/**
 * Arrival **open-carton** scan split — the procedure locus, not ingest.
 *
 * With a carton open at Arrival the operator's next pull of the trigger is
 * almost always one of two things: the shelf they are about to set the box on,
 * or the tracking of the next box. This module owns that one decision so the
 * dock waist stays dumb:
 *
 *   location barcode → place THIS carton
 *   anything else    → hand back to tracking ingest, unchanged
 *
 * Decoding is delegated to {@link extractArrivalLocationBarcode} — the ONE
 * location decoder (`arrival-command-routing.ts`). Never hand-roll a parse
 * here: that decoder deliberately rejects `routeScan`'s letter-fallback bin
 * guess, which is what keeps an Amazon `TBA…` tracking from reading as a shelf.
 *
 * Distinct from {@link classifyArrivalScan}, which is the SIDEBAR (ingest) bar's
 * mode-aware traffic cop — commands, and locations only inside a `batch_sort`
 * session committing a BATCH. Two loci, two questions.
 */

import { extractArrivalLocationBarcode } from './arrival-command-routing';
import type { Location } from '@/lib/neon/location-queries';

export function classifyArrivalCartonScan(rawInput: string):
  | { kind: 'location'; raw: string; locationBarcode: string }
  | { kind: 'tracking'; raw: string } {
  const raw = String(rawInput ?? '').trim();
  if (!raw) return { kind: 'tracking', raw: '' };

  const locationBarcode = extractArrivalLocationBarcode(raw);
  if (locationBarcode) return { kind: 'location', raw, locationBarcode };

  return { kind: 'tracking', raw };
}

/**
 * Match a decoded shelf code against the locations catalog the dock already
 * holds, so a scan places without a round trip and the dock's own shelf
 * summary stays coherent with what was just written.
 *
 * Returns null when the catalog does not carry it — the caller then resolves
 * authoritatively through `GET /api/locations/[barcode]` (the same path
 * batch-sort uses), because the catalog query is filtered to real bins.
 */
export function findLocationByBarcode(
  barcode: string,
  locations: readonly Location[],
): Location | null {
  const code = String(barcode ?? '').trim().toUpperCase();
  if (!code) return null;
  return (
    locations.find((l) => (l.barcode ?? '').trim().toUpperCase() === code) ?? null
  );
}
