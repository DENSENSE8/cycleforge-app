'use client';

import { useQuery } from '@tanstack/react-query';
import { capabilityTitle, type Capability } from '@/lib/integrations/capability-labels';

interface CapabilityProviderLabel {
  /** Runtime provider display name ("Zendesk"), or the generic capability title. */
  label: string;
  /** Connected provider key ("zendesk"), or null when nothing is connected. */
  providerKey: string | null;
}

/** The org's CONNECTED provider display name for a capability — for vendor-neutral deep-link labels ("Open in <provider>") and headers on… */
export function useCapabilityProviderLabel(cap: Capability): CapabilityProviderLabel {
  const { data } = useQuery<CapabilityProviderLabel>({
    queryKey: ['capability-label', cap],
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      const res = await fetch(`/api/integrations/capability-label?cap=${encodeURIComponent(cap)}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `capability-label ${res.status}`);
      }
      return {
        label: String(json.label),
        providerKey: json.providerKey == null ? null : String(json.providerKey),
      };
    },
  });
  return data ?? { label: capabilityTitle(cap), providerKey: null };
}
