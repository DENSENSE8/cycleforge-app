'use client';

/**
 * The org's capabilities on the client (SIMPLE-FIRST): the query the
 * chat-first home and Settings → Capabilities read, the one invalidation
 * every capability change runs (sidebar + context + this list), and the
 * realtime listener that runs it when a change lands in another tab.
 */

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { getAiAssistChannelName, safeChannelName } from '@/lib/realtime/channels';
import { BASE_CAPABILITY_ID, STARTER_CHIPS } from '@/lib/capabilities/catalog';
import type { CapabilitiesResponse } from '@/lib/capabilities/api-shape';

export const ORG_CAPABILITIES_QUERY_KEY = ['org-capabilities'] as const;

export function invalidateCapabilityQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['org-nav'] });
  void queryClient.invalidateQueries({ queryKey: ['nav-context'] });
  void queryClient.invalidateQueries({ queryKey: ORG_CAPABILITIES_QUERY_KEY });
}

export function useOrgCapabilities(enabled = true) {
  return useQuery({
    queryKey: ORG_CAPABILITIES_QUERY_KEY,
    queryFn: async (): Promise<CapabilitiesResponse> => {
      const res = await fetch('/api/capabilities', { cache: 'no-store' });
      if (!res.ok) throw new Error(`capabilities ${res.status}`);
      return (await res.json()) as CapabilitiesResponse;
    },
    staleTime: 60_000,
    enabled,
  });
}

/**
 * The chat-first home's chips: the capability starters while the org runs on
 * the base capability alone, else `null` (the everyday suggestions apply).
 */
export function useCapabilityStarters(): readonly string[] | null {
  const { data } = useOrgCapabilities();
  if (!data) return null;
  const onlyBase = data.capabilities.every((c) => c.id === BASE_CAPABILITY_ID || c.state !== 'active');
  return onlyBase ? STARTER_CHIPS : null;
}

/** Mounted once in the shell: a capability change anywhere in the org repaints this tab's nav. */
export function OrgCapabilitiesRealtime(): null {
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const channel = safeChannelName(() => getAiAssistChannelName(orgId!));
  const queryClient = useQueryClient();
  useAblyChannel(channel, 'org.capabilities.changed', () => invalidateCapabilityQueries(queryClient), !!channel);
  useAblyChannel(
    channel,
    'assistant.mutation',
    (message: { data?: { mutationKind?: string } }) => {
      if (message?.data?.mutationKind === 'org.enable_capability') invalidateCapabilityQueries(queryClient);
    },
    !!channel,
  );
  return null;
}
