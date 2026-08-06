import type { AllocationHit } from '@/lib/channel-allocation';

/**
 * Recently-tested / Ready allocation history — one fetch, shared by the KPI
 * band (chrome) and the queue body via the same React Query key so the network
 * call dedupes. Both mount under `/shipping/fba?fbaMode=ready`.
 */
export async function fetchReadyHistory(q: string): Promise<AllocationHit[]> {
  const params = new URLSearchParams({ limit: '500' });
  if (q.trim()) params.set('q', q.trim());
  const response = await fetch(`/api/shipping/ready-queue?${params.toString()}`, {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Failed to load recently-tested history');
  const json = (await response.json()) as { hits?: AllocationHit[] };
  return json.hits ?? [];
}

/** Shared query key — dedupes the KPI band and the queue body onto one fetch. */
export function readyHistoryQueryKey(q: string): readonly [string, string] {
  return ['outbound-ready-history', q];
}
