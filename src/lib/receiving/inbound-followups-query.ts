'use client';

/**
 * The ONE client read + write of inbound follow-ups (the sheet's "Check and
 * resolve" column and its colour tags) for the numbers on screen. Every face —
 * the pasted ledger's rows and cards, the sidebar popout — reads this query,
 * so a tag set on one paints on all of them at once.
 */

import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  INBOUND_FOLLOWUP_LABELS,
  type InboundFollowup,
  type InboundFollowupTag,
} from '@/lib/receiving/inbound-followups';

const ENDPOINT = '/api/receiving/inbound-followups';
const ROOT = ['inbound-followups'] as const;

interface FollowupsResponse {
  followups?: InboundFollowup[];
  error?: string;
}

async function readFollowups(keys: readonly string[], signal?: AbortSignal): Promise<InboundFollowup[]> {
  const res = await fetch(`${ENDPOINT}?keys=${encodeURIComponent(keys.join(','))}`, { signal });
  const data = (await res.json().catch(() => null)) as FollowupsResponse | null;
  if (!res.ok) throw new Error(data?.error || `Follow-ups failed (${res.status})`);
  return data?.followups ?? [];
}

/** Follow-ups for `keys` (canonical, from `inboundFollowupKey`), by key. */
export function useInboundFollowups(keys: readonly string[]): ReadonlyMap<string, InboundFollowup> {
  const sorted = useMemo(() => [...new Set(keys)].sort(), [keys]);
  const query = useQuery({
    queryKey: [...ROOT, sorted.join(',')],
    enabled: sorted.length > 0,
    staleTime: 30_000,
    queryFn: ({ signal }) => readFollowups(sorted, signal),
  });
  return useMemo(() => new Map((query.data ?? []).map((followup) => [followup.key, followup])), [query.data]);
}

export interface SetInboundFollowup {
  (keys: readonly string[], tag: InboundFollowupTag | null, note?: string | null): void;
}

/** Tag (or clear, `tag` null) every key in one write; the note rides along when given. */
export function useSetInboundFollowup(): SetInboundFollowup {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: { keys: readonly string[]; tag: InboundFollowupTag | null; note?: string | null }) => {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: input.keys, tag: input.tag, ...(input.note === undefined ? {} : { note: input.note }) }),
      });
      const data = (await res.json().catch(() => null)) as FollowupsResponse | null;
      if (!res.ok) throw new Error(data?.error || `Could not save (${res.status})`);
      return data?.followups ?? [];
    },
    onSuccess: (_rows, input) => {
      void queryClient.invalidateQueries({ queryKey: ROOT });
      const what = input.keys.length === 1 ? '1 number' : `${input.keys.length} numbers`;
      if (input.tag) toast.success(`${INBOUND_FOLLOWUP_LABELS[input.tag]} · ${what}`);
      else if (input.note === undefined) toast.message(`Cleared · ${what}`);
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not save'),
  });
  const { mutate } = mutation;
  return useCallback<SetInboundFollowup>((keys, tag, note) => {
    if (keys.length > 0) mutate({ keys, tag, note });
  }, [mutate]);
}
