'use client';

/** The signed-in staffer's rail-dismiss set for a feed (universal-feed plan Phase 4 read filter). */

import { useQuery } from '@tanstack/react-query';
import { exclusionToRailId } from '@/lib/receiving/rail/exclusion-feed-key';

interface ExclusionItem {
  entityType: string;
  entityId: number;
}

const EMPTY: ReadonlySet<number> = new Set();

export function useRailExclusions(feedKey: string | null): ReadonlySet<number> {
  const { data } = useQuery<ReadonlySet<number>>({
    queryKey: ['rail-exclusions', feedKey],
    enabled: !!feedKey,
    // The staffer's own dismissals — every writer (`useRailRowDismiss`,
    // `useRailEditMode`) invalidates this key, so the app default holds.
    queryFn: async () => {
      const res = await fetch(`/api/receiving/rail-exclusions?feedKey=${encodeURIComponent(feedKey!)}`, {
        cache: 'no-store',
      });
      if (!res.ok) return EMPTY;
      const body = (await res.json().catch(() => null)) as { items?: ExclusionItem[] } | null;
      const items = body?.items ?? [];
      return new Set(items.map((it) => exclusionToRailId(it.entityType, it.entityId)));
    },
  });
  return data ?? EMPTY;
}
