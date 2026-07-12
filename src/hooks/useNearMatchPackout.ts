'use client';

/**
 * useNearMatchPackout — hydrate the rep order-lookup workbench's near-match rail
 * rows with REAL packout proof (photos · packer · scan-out/packed time) so a rep
 * can glance-compare close matches before opening one.
 *
 * Reuses the existing `fetchDashboardOrderRowById` order-row read (the same fetch
 * `/o/[orderId]` / OrderFullPageView already performs) — NO new endpoint, NO
 * query-key or data-plane change. Cached per order id, capped by the caller to
 * the visible rail rows, and degrade-to-nothing: a row whose hydration fails just
 * shows the search-facet status/tracking it already had.
 *
 * Provenance note (verified): `packer_photos_url`, `packed_at`/`packed_by_name`
 * ride the `/api/orders`+`/api/shipped` payloads and are truly wired here. The
 * SHIP_CONFIRM scan-out columns (`ship_confirmed_at`/`shipped_out_by_name`) are
 * NOT on that fetch path today, so `timeLabel` falls back to the packed time when
 * scan-out is absent — matching what the `/o` detail itself can show without a
 * data-plane change.
 */

import { useQueries } from '@tanstack/react-query';
import { fetchDashboardOrderRowById } from '@/lib/dashboard-table-data';
import type { ShippedOrder } from '@/types/orders';

export interface NearMatchPackout {
  /** Count of packer photos on the order row (0 = none). */
  photoCount: number;
  /** Dock scanner (SHIP_CONFIRM) else packer name; null when neither is known. */
  packerName: string | null;
  /** Best available packout instant — scan-out if present, else packed. */
  timeAt: string | null;
  /** Which time `timeAt` represents, for the row label. */
  timeLabel: 'Scanned out' | 'Packed' | null;
}

/** A sentinel `'1'` in these timestamp columns means "unset" (legacy). */
function realTs(value: string | null | undefined): string | null {
  return value && value !== '1' ? value : null;
}

function toPackout(row: ShippedOrder): NearMatchPackout {
  const photos = row.packer_photos_url;
  const photoCount = Array.isArray(photos) ? photos.length : 0;
  const scannedOut = realTs(row.ship_confirmed_at);
  const packed = realTs(row.packed_at);
  return {
    photoCount,
    packerName: row.shipped_out_by_name ?? row.packed_by_name ?? null,
    timeAt: scannedOut ?? packed,
    timeLabel: scannedOut ? 'Scanned out' : packed ? 'Packed' : null,
  };
}

/**
 * Hydrate proof for the given order ids. Returns a `{ [id]: NearMatchPackout }`
 * map holding only the ids that resolved (missing/failed ids are simply absent,
 * so the rail row degrades to its search-facet display).
 */
export function useNearMatchPackout(ids: number[]): Record<number, NearMatchPackout> {
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['near-match-packout', id] as const,
      queryFn: async (): Promise<NearMatchPackout | null> => {
        const row = await fetchDashboardOrderRowById(id);
        return row ? toPackout(row) : null;
      },
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: false,
    })),
  });

  const map: Record<number, NearMatchPackout> = {};
  results.forEach((result, index) => {
    if (result.data) map[ids[index]] = result.data;
  });
  return map;
}
