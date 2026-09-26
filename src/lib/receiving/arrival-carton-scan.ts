/** Arrival **open-carton** scan split — the procedure locus, not ingest. */

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

/** Match a decoded shelf code against the locations catalog the dock already holds, so a scan places without a round trip and the dock's… */
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
