'use client';

/** The location record's one read, away from the screen that paints it. */

import { registerLocations } from '@/components/barcode/bin-label-printer/bin-printer-api';
import { locationCode, type LocationSegments } from '@/lib/barcode-routing';
import type { LocationRecord } from './location-bind-types';

export function locationRecordQueryKey(code: string) {
  return ['mobile-location-bind', code] as const;
}

/**
 * `segs` is null for a barcode that is not a flat location address (a legacy
 * bin like `QA-PICK-DEMO`): it is read as-is and never auto-registered.
 */
export async function fetchLocationRecord(
  code: string,
  segs: LocationSegments | null,
): Promise<LocationRecord> {
  const face = segs ? locationCode(segs) : code;
  const res = await fetch(`/api/locations/${encodeURIComponent(code)}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 404) {
    if (!segs) throw new Error(`No location ${code}. Location stickers read zone-aisle-bay-level-position (e.g. C-01-01-1-01).`);
    await registerLocations(`Zone ${segs.zone}`, [segs]);
    return { code, face, room: `Zone ${segs.zone}`, contents: [] };
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Failed to load location (${res.status})`);
  }
  const json = (await res.json()) as {
    location?: { room?: string | null } | null;
    contents?: Array<{
      sku?: string;
      qty?: number;
      productTitle?: string | null;
    }>;
  };
  return {
    code,
    face,
    room: json.location?.room?.trim() || null,
    contents: (json.contents ?? [])
      .filter((c) => Number(c.qty) > 0 && c.sku)
      .map((c) => ({
        sku: String(c.sku),
        qty: Number(c.qty) || 0,
        productTitle: c.productTitle ?? null,
        imageUrl: null,
      })),
  };
}
