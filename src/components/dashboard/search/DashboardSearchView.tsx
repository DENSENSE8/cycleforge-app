'use client';

/**
 * Dashboard Search mode right pane (`/dashboard?mode=search`).
 *
 * With `openOrderId` — remade two-column Search order detail (no shipped panel).
 * Without — cross-entity `SearchResultsSurface`. Order hits stay on this URL.
 * Query typing lives in the always-global header pill; this view is driven by
 * URL `?q=` (+ optional `openOrderId` / `map`).
 */

import { useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SearchResultsSurface } from '@/components/search/SearchResultsSurface';
import { isTabId, type TabId } from '@/components/search/search-tabs';
import { orderSearchHref } from '@/lib/search/search-hit';
import { useStaffSearchRecents } from '@/hooks/useStaffSearchRecents';
import {
  DASHBOARD_SEARCH_RECENTS_SCOPE,
  dashboardSearchRerunHref,
} from '@/components/dashboard/search/dashboard-search-recents';
import { SearchOrderDetailView } from '@/components/dashboard/search/SearchOrderDetailView';
import type { AiSearchHit } from '@/lib/search/ai-search-client';

export function DashboardSearchView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = (searchParams.get('q') ?? searchParams.get('dq') ?? '').trim();
  const openOrderId = (searchParams.get('openOrderId') ?? '').trim();
  const rawType = (searchParams.get('type') ?? 'all').toLowerCase();
  const tab: TabId = isTabId(rawType) && rawType !== 'order' ? rawType : 'all';

  const { push: pushRecent } = useStaffSearchRecents({
    scope: DASHBOARD_SEARCH_RECENTS_SCOPE,
  });
  const lastRecorded = useRef<string>('');
  useEffect(() => {
    if (!q || q === lastRecorded.current) return;
    lastRecorded.current = q;
    pushRecent({
      query: q,
      scope: DASHBOARD_SEARCH_RECENTS_SCOPE,
      scopeLabel: 'Search',
      scopeHref: dashboardSearchRerunHref(q),
    });
  }, [q, pushRecent]);

  // Legacy `?type=order` bookmarks → open first identifier as order detail.
  useEffect(() => {
    if (rawType === 'order' && q && !openOrderId) {
      router.replace(orderSearchHref(q, q));
    }
  }, [rawType, q, openOrderId, router]);

  const updateUrl = useCallback(
    (next: { q?: string; type?: TabId }) => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set('mode', 'search');
      sp.delete('openOrderId');
      sp.delete('dq');
      if (next.q !== undefined) {
        if (next.q) sp.set('q', next.q);
        else sp.delete('q');
      }
      if (next.type !== undefined) {
        if (next.type === 'all' || next.type === 'order') sp.delete('type');
        else sp.set('type', next.type);
      }
      router.replace(`/dashboard?${sp.toString()}`);
    },
    [router, searchParams],
  );

  const handleSelectHit = useCallback(
    (hit: AiSearchHit, event: ReactMouseEvent) => {
      if (hit.entityType !== 'order') return;
      event.preventDefault();
      router.push(orderSearchHref(hit.id, q));
    },
    [router, q],
  );

  const handleTabChange = useCallback(
    (t: TabId) => {
      if (t === 'order') {
        if (q) router.push(orderSearchHref(q, q));
        return;
      }
      updateUrl({ type: t });
    },
    [updateUrl, q, router],
  );

  if (openOrderId) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <SearchOrderDetailView openOrderId={openOrderId} query={q || undefined} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col space-y-4 overflow-y-auto px-6 py-4">
      <SearchResultsSurface
        scope="global"
        query={q}
        activeTab={tab}
        onTabChange={handleTabChange}
        onSelectHit={handleSelectHit}
      />
    </div>
  );
}
