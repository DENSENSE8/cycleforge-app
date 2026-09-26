'use client';

/** Org activation counts (`GET /api/onboarding/stats`) as a hook. */

import { useQuery } from '@tanstack/react-query';
import type { OnboardingStats } from '@/lib/onboarding/steps';

/** Shared cache key — one fetch serves every consumer on the page. */
export const ONBOARDING_STATS_QUERY_KEY = ['onboarding-stats'] as const;

export function useOnboardingStats() {
  return useQuery({
    queryKey: ONBOARDING_STATS_QUERY_KEY,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<OnboardingStats> => {
      const res = await fetch('/api/onboarding/stats');
      if (!res.ok) throw new Error(`onboarding-stats ${res.status}`);
      const body = (await res.json()) as { stats?: OnboardingStats };
      if (!body.stats) throw new Error('onboarding-stats: empty payload');
      return body.stats;
    },
  });
}

/** True when the org has DONE something — ingested an order or connected a channel. */
export function orgHasActivity(stats: OnboardingStats | undefined): boolean | undefined {
  if (!stats) return undefined;
  return stats.orders > 0 || stats.integrationsConnected > 0 || stats.receivingLines > 0;
}
