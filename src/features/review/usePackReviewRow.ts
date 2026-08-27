'use client';

import { useQuery } from '@tanstack/react-query';
import type { PackReviewQueueRow } from '@/lib/packing/pack-review-queue-types';

async function fetchPackReviewRow(packerLogId: number): Promise<PackReviewQueueRow | null> {
  const res = await fetch(
    `/api/packing/verification/queue?packerLogId=${encodeURIComponent(String(packerLogId))}`,
    { cache: 'no-store' },
  );
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return (data?.row as PackReviewQueueRow | null | undefined) ?? null;
}

/** Latest verification row for one packer_log (any outcome), for Review detail open. */
export function usePackReviewRow(packerLogId: number | null) {
  return useQuery<PackReviewQueueRow | null>({
    queryKey: ['pack-review-row', packerLogId],
    queryFn: () => fetchPackReviewRow(packerLogId!),
    enabled: packerLogId != null && packerLogId > 0,
    staleTime: 15_000,
  });
}
