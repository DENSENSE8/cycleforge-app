'use client';

/**
 * useStaffSearchRecents — React binding over the DB-backed per-staff recents
 * store (`/api/search/recents`, SoT `search_recents`). Same surface as the
 * localStorage `useSearchRecents` (`{ recents, push, remove, clear }`) so the
 * shared `SearchRecentsDropdown` renders over either store.
 *
 * Cross-device + cache-wipe-durable (unlike the per-browser localStorage store).
 * Each mutation returns the fresh newest-first list, so we seed the query cache
 * from the response — no second round-trip.
 */

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SearchRecentEntry } from '@/lib/search/search-recents';

interface UseStaffSearchRecentsOptions {
  scope?: string;
  limit?: number;
  /** Gate the fetch (e.g. only when the Search mode is mounted). */
  enabled?: boolean;
}

interface PushStaffRecentArgs {
  query: string;
  scope?: string;
  scopeLabel?: string;
  scopeHref?: string;
  resultCount?: number;
  topHit?: SearchRecentEntry['topHit'];
}

const RECENTS_ROOT = 'staff-search-recents';

function queryString(opts: { scope?: string; limit?: number }): string {
  const sp = new URLSearchParams();
  if (opts.scope) sp.set('scope', opts.scope);
  if (opts.limit) sp.set('limit', String(opts.limit));
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export function useStaffSearchRecents(options: UseStaffSearchRecentsOptions = {}) {
  const { scope, limit, enabled = true } = options;
  const queryClient = useQueryClient();
  const queryKey = [RECENTS_ROOT, scope ?? null, limit ?? null] as const;

  const { data, isLoading, refetch } = useQuery<SearchRecentEntry[]>({
    queryKey,
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetch(`/api/search/recents${queryString({ scope, limit })}`, {
        cache: 'no-store',
      });
      if (!res.ok) return [];
      const json = await res.json();
      return (json.recents ?? []) as SearchRecentEntry[];
    },
  });

  const setRecents = useCallback(
    (recents: SearchRecentEntry[]) => queryClient.setQueryData(queryKey, recents),
    [queryClient, queryKey],
  );

  const push = useCallback(
    async (entry: PushStaffRecentArgs) => {
      const trimmed = entry.query.trim();
      if (!trimmed) return;
      try {
        const res = await fetch('/api/search/recents', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...entry, query: trimmed }),
        });
        if (res.ok) {
          const json = await res.json();
          setRecents((json.recents ?? []) as SearchRecentEntry[]);
        }
      } catch {
        // Non-blocking — recents are a convenience, never gate the search.
      }
    },
    [setRecents],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/search/recents?id=${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          const json = await res.json();
          setRecents((json.recents ?? []) as SearchRecentEntry[]);
        }
      } catch {
        /* ignore */
      }
    },
    [setRecents],
  );

  const clear = useCallback(async () => {
    setRecents([]);
    try {
      await fetch(`/api/search/recents${scope ? `?scope=${encodeURIComponent(scope)}` : ''}`, {
        method: 'DELETE',
      });
    } catch {
      /* ignore */
    }
  }, [scope, setRecents]);

  return { recents: data ?? [], isLoading, refresh: refetch, push, remove, clear };
}
