'use client';

/**
 * Org activation counts (`GET /api/onboarding/stats`) as a hook.
 *
 * Extracted from `GettingStartedChecklist`, which had the fetch inline, because
 * a SECOND consumer arrived: the To-ship queue needs to know whether an empty
 * result set means "brand-new org" or "queue is clear". Two copies of this
 * query would be two answers to one question — and the one that matters here is
 * whether to teach an established org to set itself up.
 *
 * `staleTime` is deliberately long: activation counts change a handful of times
 * in an org's entire life, and the server caps every COUNT for cheapness.
 */

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

/**
 * True when the org has DONE something — ingested an order or connected a
 * channel. The negation is the only honest trigger for a first-run teaching
 * state, and it is deliberately not derived from a filtered query result: an
 * empty queue on a mature org is a clear queue, not a fresh install.
 *
 * Unknown (loading / failed) is NOT "new": pass `undefined` and callers keep
 * their ordinary empty state.
 */
export function orgHasActivity(stats: OnboardingStats | undefined): boolean | undefined {
  if (!stats) return undefined;
  return stats.orders > 0 || stats.integrationsConnected > 0 || stats.receivingLines > 0;
}
