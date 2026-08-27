'use client';

/**
 * `/search` with no query — staff search history.
 *
 * Opened from the header find picker (Recent searches, option 0). Rows are
 * the same recents the header writes (DB store + local fallback).
 */

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock } from '@/components/Icons';
import { EmptyState } from '@/design-system/primitives';
import { StationBlockLabel } from '@/components/station/collapse';
import { SearchRecentsDropdown } from '@/components/search/SearchRecentsDropdown';
import { useSearchRecents } from '@/hooks/useSearchRecents';
import {
  desktopRecentOpenHref,
} from '@/lib/search/search-page-recents';
import { SEARCH_RECENTS_RAIL_KEY_PREFIX } from '@/lib/search/staff-recents-client';
import { type SearchRecentEntry } from '@/lib/search/search-recents';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';

async function fetchStaffRecents(): Promise<SearchRecentEntry[]> {
  const res = await fetch('/api/search/recents?limit=50', { cache: 'no-store' });
  if (!res.ok) return [];
  const json = (await res.json()) as { recents?: SearchRecentEntry[] };
  return Array.isArray(json.recents) ? json.recents : [];
}

export function SearchRecentsLanding() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { recents: localRecents, remove: removeLocal, clear: clearLocal } = useSearchRecents({
    limit: 50,
  });

  const staffQuery = useQuery({
    queryKey: [SEARCH_RECENTS_RAIL_KEY_PREFIX, 'landing'],
    queryFn: fetchStaffRecents,
    staleTime: 15_000,
  });

  const recents =
    staffQuery.data && staffQuery.data.length > 0 ? staffQuery.data : localRecents;

  const openRecent = useCallback(
    (entry: SearchRecentEntry) => {
      const dest = desktopRecentOpenHref(entry);
      // #region agent log
      fetch('http://127.0.0.1:7905/ingest/963a9b6c-b9e1-4ea4-8873-db315c94d962',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'05d676'},body:JSON.stringify({sessionId:'05d676',runId:'recents-picker',hypothesisId:'H',location:'SearchRecentsLanding.tsx:openRecent',message:'open recent from landing',data:{dest,isMobile:dest.startsWith('/m/')||dest.startsWith('/01/'),query:entry.query},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      router.push(dest);
    },
    [router],
  );

  const handleRemove = useCallback(
    (id: string) => {
      removeLocal(id);
      if (/^\d+$/.test(id)) {
        void fetch(`/api/search/recents?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
          .then(() =>
            queryClient.invalidateQueries({ queryKey: [SEARCH_RECENTS_RAIL_KEY_PREFIX] }),
          )
          .catch(() => {});
      }
    },
    [removeLocal, queryClient],
  );

  const handleClear = useCallback(() => {
    clearLocal();
    void fetch('/api/search/recents', { method: 'DELETE' })
      .then(() => queryClient.invalidateQueries({ queryKey: [SEARCH_RECENTS_RAIL_KEY_PREFIX] }))
      .catch(() => {});
  }, [clearLocal, queryClient]);

  if (staffQuery.isLoading && recents.length === 0) {
    return <UniversalLoader isLoading label="Loading recent searches" />;
  }

  if (recents.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-start justify-center p-8">
        <EmptyState
          icon={<Clock className="h-6 w-6 text-text-faint" />}
          title="No recent searches"
          description="Searches you run from the header land here."
        />
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-4 py-4">
        <StationBlockLabel label="Recent searches" />
        <SearchRecentsDropdown
          recents={recents}
          onSelect={openRecent}
          onRemove={handleRemove}
          onClearAll={handleClear}
        />
      </div>
    </div>
  );
}
