'use client';

/**
 * Dashboard Search mode right pane (`/dashboard?mode=search`).
 *
 * Resolution is owned by `useDashboardSearchOrder` (single pipeline). By phase:
 *   - `order`     → single-lane Search order detail shell (Overview default).
 *   - `resolving` → one spinner (no results-list flash before an exact match).
 *   - `fba`/`notfound` → teaching empty shell.
 *   - `list`      → cross-entity `SearchResultsSurface` (natural-language query).
 *
 * An exact order # / tracking / serial query goes spinner → detail directly.
 * Only a natural-language query renders the list; its sole-ORDER convenience
 * open lives in `onResults` here (identifier exact-match is the hook's job).
 */

import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ExternalLink, Loader2, Package } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { SearchResultsSurface } from '@/components/search/SearchResultsSurface';
import {
  looksLikeIdentifier,
  orderSearchHref,
  shouldAutoOpenSearchOrder,
} from '@/lib/search/search-hit';
import { useStaffSearchRecents } from '@/hooks/useStaffSearchRecents';
import {
  DASHBOARD_SEARCH_RECENTS_SCOPE,
  dashboardSearchRerunHref,
} from '@/components/dashboard/search/dashboard-search-recents';
import { SearchOrderDetailShell } from '@/components/dashboard/search/SearchOrderDetailShell';
import { useDashboardSearchOrder } from '@/components/dashboard/search/useDashboardSearchOrder';
import type { AiSearchHit } from '@/lib/search/ai-search-client';

function OrderLoadingState() {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-surface-canvas">
      <span className="flex items-center gap-2 text-role-caption font-semibold text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading order…
      </span>
    </div>
  );
}

function EmptyStateShell({
  title,
  body,
  action,
}: {
  title: string;
  body: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-surface-canvas">
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-sm rounded-xl border border-dashed border-border-soft bg-surface-canvas px-6 py-10 text-center">
          <Package className="mx-auto mb-3 h-8 w-8 text-text-faint" />
          <p className="text-role-caption font-semibold text-text-default">{title}</p>
          <p className="mt-1 text-role-caption text-text-muted">{body}</p>
          {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function DashboardSearchView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = (searchParams.get('q') ?? searchParams.get('dq') ?? '').trim();
  const openOrderId = (searchParams.get('openOrderId') ?? '').trim();

  const resolution = useDashboardSearchOrder({ q, openOrderId });

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

  // Sole-ORDER convenience open for a natural-language query showing the list.
  // Identifier exact-match is the hook's job; guard against a double navigate.
  const autoOpenQueryRef = useRef<string | null>(null);
  useEffect(() => {
    autoOpenQueryRef.current = null;
  }, [q]);
  const handleResults = useCallback(
    (hits: AiSearchHit[]) => {
      if (openOrderId || looksLikeIdentifier(q)) return;
      if (!shouldAutoOpenSearchOrder(hits)) return;
      const key = q.trim();
      if (!key || autoOpenQueryRef.current === key) return;
      autoOpenQueryRef.current = key;
      router.replace(orderSearchHref(hits[0].id, q));
    },
    [openOrderId, q, router],
  );

  if (resolution.phase === 'resolving') {
    return <OrderLoadingState />;
  }

  if (resolution.phase === 'order') {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <SearchOrderDetailShell order={resolution.order} initialSection="overview" />
      </div>
    );
  }

  if (resolution.phase === 'fba') {
    return (
      <EmptyStateShell
        title="This is an Amazon FBA shipment"
        body="FBA shipments are managed in the FBA workspace, not Search order detail."
        action={
          <Button
            variant="primary"
            size="md"
            icon={<ExternalLink className="h-3.5 w-3.5" />}
            onClick={() => router.push('/fba')}
          >
            Open FBA workspace
          </Button>
        }
      />
    );
  }

  if (resolution.phase === 'notfound') {
    return (
      <EmptyStateShell
        title="Order not found"
        body={
          <>
            Couldn&apos;t load <span className="font-mono">{resolution.ref}</span>.
          </>
        }
      />
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
