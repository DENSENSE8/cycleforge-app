'use client';

/**
 * Dashboard Search mode right pane (`/dashboard?mode=search`).
 *
 * With `openOrderId` — remade two-column Search order detail (no shipped panel).
 * Without — cross-entity `SearchResultsSurface` (grouped, no category pills).
 * Identifier queries resolve immediately via lookup so exact order #s open
 * detail without waiting on retrieve / Overview.
 */

import { useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SearchResultsSurface } from '@/components/search/SearchResultsSurface';
import {
  looksLikeIdentifier,
  orderSearchHref,
  shouldAutoOpenSearchOrder,
} from '@/lib/search/search-hit';
import { resolveSearchOrder } from '@/lib/search/resolve-search-order';
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

  const handleSelectHit = useCallback(
    (hit: AiSearchHit, event: ReactMouseEvent) => {
      if (hit.entityType !== 'order') return;
      event.preventDefault();
      router.push(orderSearchHref(hit.id, q));
    },
    [router, q],
  );

  /** Sole-hit / identifier open attempts — keyed by q. */
  const autoOpenQueryRef = useRef<string | null>(null);
  const identifierAttemptRef = useRef<string | null>(null);
  /** True after detail was open — Back clears attempts so re-open can fire. */
  const hadOpenOrderRef = useRef(false);

  useEffect(() => {
    if (!q.trim()) {
      autoOpenQueryRef.current = null;
      identifierAttemptRef.current = null;
      hadOpenOrderRef.current = false;
      return;
    }
    if (openOrderId) {
      hadOpenOrderRef.current = true;
      return;
    }
    if (hadOpenOrderRef.current) {
      hadOpenOrderRef.current = false;
      autoOpenQueryRef.current = null;
      identifierAttemptRef.current = null;
    }
  }, [q, openOrderId]);

  // Identifier → resolve via lookup immediately (no wait for retrieve).
  useEffect(() => {
    if (openOrderId || !q || !looksLikeIdentifier(q)) return;
    if (identifierAttemptRef.current === q) return;
    identifierAttemptRef.current = q;

    let cancelled = false;
    void (async () => {
      const next = await resolveSearchOrder(q);
      if (cancelled) return;
      if (next.status === 'ok') {
        router.replace(orderSearchHref(next.order.id, q));
      }
      // notfound / fba → stay on grouped results (Zoho PO / non-order ids).
    })();

    return () => {
      cancelled = true;
    };
  }, [openOrderId, q, router]);

  const handleResults = useCallback(
    (hits: AiSearchHit[]) => {
      if (openOrderId) return;
      // Identifier path owns open for digit-bearing tokens — avoid double navigate.
      if (looksLikeIdentifier(q)) return;
      if (!shouldAutoOpenSearchOrder(hits)) return;
      const key = q.trim();
      if (!key || autoOpenQueryRef.current === key) return;
      autoOpenQueryRef.current = key;
      router.replace(orderSearchHref(hits[0].id, q));
    },
    [openOrderId, q, router],
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
        onSelectHit={handleSelectHit}
        onResults={handleResults}
      />
    </div>
  );
}
