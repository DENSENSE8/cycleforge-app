'use client';

/**
 * usePackPhotoCounts — batch pack-photo counts for a list of tracking numbers.
 *
 * The header search preview paints a pack-photo CTA on every row, and the CTA
 * must show a truthful number (0 included) rather than inferring "has photos"
 * from the presence of a shipment. One batched request per preview render
 * keeps that honest without a request per row.
 *
 * Returns a lookup that reads a missing key as 0 once the fetch has settled,
 * and `null` while it is still in flight — so the row can hold the count back
 * instead of flashing a wrong 0.
 */

import { useQuery } from '@tanstack/react-query';
import { normalizeTrackingKey } from '@/lib/tracking-format';

interface PackPhotoCountsResponse {
  counts: Record<string, number>;
}

async function fetchCounts(keys: string[]): Promise<PackPhotoCountsResponse> {
  const params = new URLSearchParams({ tracking: keys.join(',') });
  const res = await fetch(`/api/packing-photos/counts?${params.toString()}`, {
    cache: 'no-store',
  });
  if (!res.ok) return { counts: {} };
  return res.json();
}

export function usePackPhotoCounts(trackingNumbers: (string | null | undefined)[]) {
  const keys = [...new Set(trackingNumbers.map(normalizeTrackingKey).filter(Boolean))].sort();

  const query = useQuery<PackPhotoCountsResponse>({
    // Key on the sorted set so re-ordered previews reuse the cached answer.
    queryKey: ['pack-photo-counts', keys.join(',')],
    queryFn: () => fetchCounts(keys),
    enabled: keys.length > 0,
    staleTime: 30_000,
  });

  /** null = not resolved yet; a number once the batch has settled. */
  return (tracking: string | null | undefined): number | null => {
    const key = normalizeTrackingKey(tracking);
    if (!key) return 0;
    if (!query.isSuccess) return null;
    return query.data?.counts[key] ?? 0;
  };
}
