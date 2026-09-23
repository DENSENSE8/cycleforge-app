'use client';

import { useQuery } from '@tanstack/react-query';
import type { DockStagingCandidate } from '@/lib/outbound/dock-staging-contract';

export type DockStagingPayload = {
  ok: boolean;
  pending: DockStagingCandidate[];
  staged: DockStagingCandidate[];
};

export async function fetchDockStaging(): Promise<DockStagingPayload> {
  const response = await fetch('/api/shipping/mark-staged', {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Could not load dock staging (${response.status})`);
  return response.json();
}

export function useDockStaging() {
  return useQuery({
    queryKey: ['outbound', 'dock-staging'],
    queryFn: fetchDockStaging,
    staleTime: 10_000,
  });
}
