'use client';

/** Daily-check item LINKS — the query half both faces share. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DailyCheckItemLink,
  DailyCheckLinkInput,
} from '@/lib/daily-checks/types';

const linksKey = (itemId: number) => ['daily-check-links', itemId] as const;

export function useDailyCheckLinks(itemId: number | null) {
  return useQuery({
    queryKey: itemId == null ? ['daily-check-links', 'none'] : linksKey(itemId),
    queryFn: async (): Promise<DailyCheckItemLink[]> => {
      const res = await fetch(`/api/daily-checks/items/${itemId}/links`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`links failed (${res.status})`);
      const body = (await res.json()) as { links: DailyCheckItemLink[] };
      return body.links;
    },
    enabled: itemId != null,
    staleTime: 15_000,
  });
}

export function useDailyCheckLinkActions(itemId: number | null) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    if (itemId != null) void queryClient.invalidateQueries({ queryKey: linksKey(itemId) });
  };

  const attach = useMutation({
    mutationFn: async (input: DailyCheckLinkInput) => {
      if (itemId == null) throw new Error('no item');
      const res = await fetch(`/api/daily-checks/items/${itemId}/links`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(`attach failed (${res.status})`);
      return res.json() as Promise<DailyCheckItemLink>;
    },
    onSuccess: invalidate,
  });

  const detach = useMutation({
    mutationFn: async (linkId: number) => {
      if (itemId == null) throw new Error('no item');
      const res = await fetch(`/api/daily-checks/items/${itemId}/links?linkId=${linkId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`detach failed (${res.status})`);
    },
    onSuccess: invalidate,
  });

  return { attach, detach };
}

/**
 * Attach a batch of links to a JUST-CREATED item — the composer's second
 * phase. Sequential on purpose: the links route upserts per shape, and the
 * order the operator typed is the order the detail sheet lists them in.
 */
export async function attachDailyCheckLinks(
  itemId: number,
  links: readonly DailyCheckLinkInput[],
): Promise<void> {
  for (const link of links) {
    const res = await fetch(`/api/daily-checks/items/${itemId}/links`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(link),
    });
    if (!res.ok) throw new Error(`attach failed (${res.status})`);
  }
}
