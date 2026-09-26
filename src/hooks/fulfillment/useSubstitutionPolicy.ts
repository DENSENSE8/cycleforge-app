'use client';

import { useQuery } from '@tanstack/react-query';
import type { SubstitutionPolicy } from '@/lib/tech/substitution-eligibility';

/** Org fulfillment-substitution policy for the station surfaces — GET /api/fulfillment/substitution-policy (flag + enforcement + allowed… */

const substitutionPolicyKey = ['substitution-policy'] as const;

const DISABLED_POLICY: SubstitutionPolicy = {
  enabled: false,
  enforcement: 'advisory',
  allowedNodes: [],
  canSubstitute: false,
};

export function useSubstitutionPolicy() {
  return useQuery({
    queryKey: substitutionPolicyKey,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SubstitutionPolicy> => {
      const res = await fetch('/api/fulfillment/substitution-policy', { cache: 'no-store' });
      if (!res.ok) return DISABLED_POLICY;
      const data = await res.json().catch(() => null);
      if (!data || typeof data !== 'object') return DISABLED_POLICY;
      return data as SubstitutionPolicy;
    },
  });
}
