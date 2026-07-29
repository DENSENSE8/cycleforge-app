'use client';

/**
 * `/search` — the cross-entity search surface.
 *
 * Search used to be a `/dashboard` MODE, which over-weighted it: it consumed
 * one of three L2 slots, owned a mode-local order-detail shell (a third way to
 * look at an order), and left the dashboard's own context panel showing a
 * recents list that had nothing to do with the order workbench underneath.
 * `docs/todo/dashboard-ia-rework-PLAN.md` Phase 1 evicts it to its own route —
 * the same move `?warranty=` → `/support` already made.
 *
 * Contract:
 *   • `?q=` is the whole state. Typing still happens in the global header pill.
 *   • Results are the display; there is no detail shell here. A hit opens its
 *     own record surface (`searchHitHref`) — for an order that is `/o/[id]`.
 *   • A SOLE hit is not a choice: it redirects straight to that record.
 *   • Empty `q` teaches, and offers this staff member's recent queries.
 *
 * Region contract: Monitor-ish observe over a retrieval, but with no durable
 * selection of its own — the filter (`?q=`) IS the state.
 */

import { Suspense, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Search } from '@/components/Icons';
import { SearchResultsSurface } from '@/components/search/SearchResultsSurface';
import { SearchRecentsDropdown } from '@/components/search/SearchRecentsDropdown';
import { useStaffSearchRecents } from '@/hooks/useStaffSearchRecents';
import { soleHitHref } from '@/lib/search/search-hit';
import { SEARCH_RECENTS_SCOPE, searchRerunHref } from '@/lib/search/search-page-recents';
import type { AiSearchHit } from '@/lib/search/ai-search-client';

function SearchPageFallback() {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-surface-canvas">
      <span className="flex items-center gap-2 text-role-caption font-semibold text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading search…
      </span>
    </div>
  );
}

function SearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = (searchParams.get('q') ?? '').trim();

  const {
    push: pushRecent,
    recents,
    remove: removeRecent,
    clear: clearRecents,
  } = useStaffSearchRecents({ scope: SEARCH_RECENTS_SCOPE });

  const lastRecorded = useRef<string>('');
  useEffect(() => {
    if (!q || q === lastRecorded.current) return;
    lastRecorded.current = q;
    pushRecent({
      query: q,
      scope: SEARCH_RECENTS_SCOPE,
      scopeLabel: 'Search',
      scopeHref: searchRerunHref(q),
    });
  }, [q, pushRecent]);

  // Sole-hit convenience open. One row is not a choice — but guard against
  // re-firing for the same query after the operator navigates back.
  const autoOpenedRef = useRef<string | null>(null);
  useEffect(() => {
    autoOpenedRef.current = null;
  }, [q]);

  const handleResults = useCallback(
    (hits: AiSearchHit[]) => {
      const key = q;
      if (!key || autoOpenedRef.current === key) return;
      const href = soleHitHref(hits);
      if (!href) return;
      autoOpenedRef.current = key;
      router.replace(href);
    },
    [q, router],
  );

  if (!q) {
    return (
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-4 overflow-y-auto px-6 py-10">
        <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas inset-empty text-center">
          <Search className="mx-auto mb-2 h-5 w-5 text-text-faint" />
          <p className="text-role-caption font-semibold text-text-muted">Search everything</p>
          <p className="mt-1 text-role-micro font-medium text-text-faint">
            Type an order #, PO, tracking, serial, SKU, or customer in the header search.
          </p>
        </div>
        <SearchRecentsDropdown
          recents={recents}
          onSelect={(entry) => router.push(searchRerunHref(entry.query))}
          onRemove={removeRecent}
          onClearAll={() => void clearRecents()}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col space-y-4 overflow-y-auto px-6 py-4">
      <SearchResultsSurface scope="global" query={q} onResults={handleResults} />
    </div>
  );
}

export default function SearchPage() {
  return (
    <div className="flex min-h-0 w-full flex-1">
      <Suspense fallback={<SearchPageFallback />}>
        <SearchPageContent />
      </Suspense>
    </div>
  );
}
