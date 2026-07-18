'use client';

/**
 * SearchWorkspace — thin cross-entity launcher for `/search` (Overview +
 * category tabs). Order lookup is **not** owned here: the header handoff and
 * order hit rows go straight to `/o/[id]?mode=search&q=` (master-nav
 * `OrderWorkspaceSidebar` + full-width `OrderFullPageView`).
 *
 * One search input: the global header pill, registered here in CONTEXTUAL mode
 * so it live-drives `?q=` while the user is on `/search`.
 */

import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/pane-header';
import { SearchResultsSurface } from '@/components/search/SearchResultsSurface';
import { isTabId, type TabId } from '@/components/search/search-tabs';
import { usePageHeaderSearch } from '@/hooks/usePageHeader';
import { orderSearchHref } from '@/lib/search/search-hit';
import type { AiSearchHit } from '@/lib/search/ai-search-client';

export function SearchWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = (searchParams.get('q') ?? '').trim();
  const rawType = (searchParams.get('type') ?? 'all').toLowerCase();
  // Orders never render as an in-page workbench — keep Overview (or other
  // entity tabs). Legacy `?type=order` bookmarks fall through to Overview.
  const tab: TabId = isTabId(rawType) && rawType !== 'order' ? rawType : 'all';

  const [input, setInput] = useState(q);
  const [surfaceBusy, setSurfaceBusy] = useState(false);

  useEffect(() => {
    setInput(q);
  }, [q]);

  // Identifier / order-only bookmarks that still land on /search?type=order
  // should bounce straight to the /o workbench (kills the old→new flash).
  useEffect(() => {
    if (rawType !== 'order' || !q) return;
    router.replace(orderSearchHref(q, q));
  }, [rawType, q, router]);

  const updateUrl = useCallback(
    (next: { q?: string; type?: TabId }) => {
      const sp = new URLSearchParams(searchParams.toString());
      // Drop legacy workbench params if present.
      sp.delete('openOrderId');
      if (next.q !== undefined) {
        if (next.q) sp.set('q', next.q);
        else sp.delete('q');
      }
      if (next.type !== undefined) {
        if (next.type === 'all' || next.type === 'order') sp.delete('type');
        else sp.set('type', next.type);
      }
      router.replace(`/search?${sp.toString()}`);
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
      placeholder: 'Search orders, serials, cartons, SKUs, repairs, FBA…',
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
      // Orders tab → leave the launcher for the real workbench.
      if (t === 'order') {
        const query = (input || q).trim();
        if (query) router.push(orderSearchHref(query, query));
        else router.push('/dashboard');
        return;
      }
      updateUrl({ type: t });
    },
    [updateUrl, input, q, router],
  );

  return (
    <>
      <PageHeader title="Search" maxWidth="5xl" />
      <div className="mx-auto w-full max-w-5xl flex-1 space-y-4 overflow-y-auto px-6 py-4">
        <SearchResultsSurface
          scope="global"
          query={q}
          activeTab={tab}
          onTabChange={handleTabChange}
          onLoadingChange={setSurfaceBusy}
          onSelectHit={handleSelectHit}
        />
      </div>
    </>
  );
}
