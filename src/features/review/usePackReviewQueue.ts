'use client';

import { useQuery } from '@tanstack/react-query';
import type {
  PackReviewBucket,
  PackReviewQueueRow,
} from '@/lib/packing/pack-review-queue-types';

async function fetchQueue(bucket: PackReviewBucket): Promise<PackReviewQueueRow[]> {
  const res = await fetch(
    `/api/packing/verification/queue?bucket=${encodeURIComponent(bucket)}&limit=200`,
    { cache: 'no-store' },
  );
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  return Array.isArray(data?.rows) ? (data.rows as PackReviewQueueRow[]) : [];
}

/** The Review station's latest-outcome queue, scoped to one tab bucket. */
export function usePackReviewQueue(
  bucket: PackReviewBucket,
  opts: { enabled?: boolean } = {},
) {
  return useQuery<PackReviewQueueRow[]>({
    queryKey: ['pack-review-queue', bucket],
    queryFn: () => fetchQueue(bucket),
    staleTime: 15_000,
    enabled: opts.enabled !== false,
  });
}
