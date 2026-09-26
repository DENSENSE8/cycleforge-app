import type { LocationSegments } from '@/lib/barcode-routing';
import type { Location } from '@/lib/neon/location-queries';

/** Register bin rows in the locations table before printing so scans of the printed QR resolve to a real bin (putaway audits work, the bin… */
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
