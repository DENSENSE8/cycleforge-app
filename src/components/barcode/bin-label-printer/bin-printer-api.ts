import type { LocationSegments } from '@/lib/barcode-routing';
import type { Location } from '@/lib/neon/location-queries';

/**
 * Register bin rows in the locations table before printing so scans of the
 * printed QR resolve to a real bin (putaway audits work, the bin shows in
 * bins-overview). Throws on failure — printing an orphan label is worse than not
 * printing.
 *
 * Returns the registered rows. The printer flows ignore them (they only need
 * the throw), but a caller that must ACT on the new bin — Arrival's new-location
 * Displays leaf places the open carton on it — needs the id, and re-querying for
 * a row this call just created would be a second source of truth for it.
 */
export async function registerLocations(
  room: string,
  segments: LocationSegments[],
): Promise<Location[]> {
  const res = await fetch('/api/locations/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room, segments }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || `Registration failed (HTTP ${res.status})`);
  }
  return Array.isArray(data?.bins) ? (data.bins as Location[]) : [];
}
