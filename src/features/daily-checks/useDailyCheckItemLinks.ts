'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DailyCheckItemLink, DailyCheckLinkEntityType } from '@/lib/daily-checks/types';

const linksKey = (itemId: number) => ['daily-check-links', itemId] as const;

export function useDailyCheckItemLinks(itemId: number | null) {
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
    mutationFn: async (input: {
      entityType: DailyCheckLinkEntityType;
      entityId: number;
      label?: string | null;
    }) => {
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
