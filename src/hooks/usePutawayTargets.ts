'use client';

/**
 * The org's directed-putaway links — which rack / shelf each receiving Type
 * goes to. One cached read per session: the Unbox next-step card looks the
 * Type pill up in this map, so changing the pill updates it with no request.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { safeRandomUUID } from '@/lib/safe-uuid';
import {
  PUTAWAY_TARGETS_QUERY_KEY,
  PUTAWAY_TARGETS_URL,
  type PutawayIntakeKind,
  type PutawayTargets,
} from '@/lib/receiving/putaway-targets-contract';

async function putawayRequest(init?: RequestInit): Promise<PutawayTargets> {
  const res = await fetch(PUTAWAY_TARGETS_URL, init);
  const data = (await res.json().catch(() => null)) as
    | { success: true; targets: PutawayTargets }
    | { success: false; error?: string }
    | null;
  if (!res.ok || !data || !data.success) {
    throw new Error((data && 'error' in data && data.error) || `Putaway targets ${res.status}`);
  }
  return data.targets;
}

export function usePutawayTargets() {
  return useQuery({
    queryKey: PUTAWAY_TARGETS_QUERY_KEY,
    queryFn: () => putawayRequest(),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

type PutawayLinkInput =
  | { action: 'link'; kind: PutawayIntakeKind; scanned: string }
  | { action: 'unlink'; kind: PutawayIntakeKind };

export function usePutawayTargetLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PutawayLinkInput) =>
      putawayRequest({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, clientEventId: safeRandomUUID() }),
      }),
    onSuccess: (targets) => qc.setQueryData(PUTAWAY_TARGETS_QUERY_KEY, targets),
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not link the rack'),
  });
}
