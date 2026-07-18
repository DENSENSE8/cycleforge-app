'use client';

/**
 * Dashboard Search mode right pane (`/dashboard?mode=search`).
 *
 * Master-nav owns the L2 rail (Search · Receiving · Shipping). This pane is the
 * visual results surface — thin launcher (same as `/search`), not an in-content
 * order workbench. Order hits deep-link to `/o/[id]?mode=search&q=` so detail
 * opens in the dedicated order workbench with `OrderWorkspaceSidebar` as the map.
 */

import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SearchResultsSurface } from '@/components/search/SearchResultsSurface';
import { isTabId, type TabId } from '@/components/search/search-tabs';
import { usePageHeaderSearch } from '@/hooks/usePageHeader';
import { orderSearchHref, looksLikeIdentifier } from '@/lib/search/search-hit';
import { useStaffSearchRecents } from '@/hooks/useStaffSearchRecents';
import {
  DASHBOARD_SEARCH_RECENTS_SCOPE,
  dashboardSearchRerunHref,
} from '@/components/dashboard/search/dashboard-search-recents';
import type { AiSearchHit } from '@/lib/search/ai-search-client';

export function DashboardSearchView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = (searchParams.get('q') ?? searchParams.get('dq') ?? '').trim();
  const rawType = (searchParams.get('type') ?? 'all').toLowerCase();
  const tab: TabId = isTabId(rawType) && rawType !== 'order' ? rawType : 'all';

  const [input, setInput] = useState(q);
  const [surfaceBusy, setSurfaceBusy] = useState(false);

  // Per-staff recents (DB-backed) — the sidebar shows these; we record here on
  // an explicit search (Enter), where the committed query is known.
  const { push: pushRecent } = useStaffSearchRecents({
    scope: DASHBOARD_SEARCH_RECENTS_SCOPE,
  });
  const recordRecent = useCallback(
    (query: string) => {
      const t = query.trim();
      if (!t) return;
      pushRecent({
        query: t,
        scope: DASHBOARD_SEARCH_RECENTS_SCOPE,
        scopeLabel: 'Search',
        scopeHref: dashboardSearchRerunHref(t),
      });
    },
    [pushRecent],
  );

  useEffect(() => {
    setInput(q);
  }, [q]);

  // Identifier pasted while already on Dashboard Search → bounce to /o (no flash).
  useEffect(() => {
    if (rawType === 'order' && q) {
      router.replace(orderSearchHref(q, q));
    }
  }, [rawType, q, router]);

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

  usePageHeaderSearch(
    {
      value: input,
      onChange: (value) => {
        setInput(value);
        updateUrl({ q: value.trim() });
      },
      onClear: () => {
        setInput('');
        updateUrl({ q: '' });
      },
      onSearch: (value) => {
        const t = value.trim();
        if (!t) return;
        recordRecent(t);
        if (looksLikeIdentifier(t)) {
          router.push(orderSearchHref(t, t));
          return;
        }
        updateUrl({ q: t });
      },
      placeholder: 'Search orders, serials, cartons, SKUs…',
      debounceMs: 250,
      isSearching: surfaceBusy,
    },
    [input, surfaceBusy],
  );

  const handleSelectHit = useCallback(
    (hit: AiSearchHit, event: ReactMouseEvent) => {
      if (hit.entityType !== 'order') return;
      event.preventDefault();
      router.push(orderSearchHref(hit.id, q || input));
    },
    [router, q, input],
  );

  const handleTabChange = useCallback(
    (t: TabId) => {
      if (t === 'order') {
        const query = (input || q).trim();
        if (query) router.push(orderSearchHref(query, query));
        return;
      }
      updateUrl({ type: t });
    },
    [updateUrl, input, q, router],
  );

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col space-y-4 overflow-y-auto px-6 py-4">
      <SearchResultsSurface
        scope="global"
        query={q}
        activeTab={tab}
        onTabChange={handleTabChange}
        onLoadingChange={setSurfaceBusy}
        onSelectHit={handleSelectHit}
      />
    </div>
  );
}
