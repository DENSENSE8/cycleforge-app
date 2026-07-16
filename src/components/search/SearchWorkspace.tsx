'use client';

/**
 * SearchWorkspace — the /search results page body (see src/app/search/page.tsx
 * header for the contract). Owns the URL state (?q= / ?type= / ?openOrderId=).
 *
 * Two shapes, one page:
 *  • Every tab EXCEPT Orders renders the classic centered results surface
 *    (grouped Overview + scoped category lists) — byte-identical to before.
 *  • The **Orders** tab (`?type=order`) is the rep order-lookup **Workbench**
 *    (`list → select → detail`): a near-match rail (the same SearchResultsSurface,
 *    order-scoped) on the left, and a persistent order detail pane on the right
 *    that opens IN PLACE — the top match auto-opens, and other close matches are
 *    selectable without ever navigating away. Selection lives in `?openOrderId=`
 *    (durable + deep-linkable); the standalone `/o/[orderId]` page is untouched.
 *
 * The detail pane REUSES `OrderFullPageView` (the exact component `/o/[orderId]`
 * renders — it self-resolves from the id), so there is no forked order-detail
 * component and all packout proof already renders. Engine is untouched: retrieval
 * is the shared SearchResultsSurface; we only intercept order row clicks via its
 * existing `onSelectHit`.
 *
 * There is ONE search input: the global header pill, registered here in
 * CONTEXTUAL mode (usePageHeaderSearch) so it live-drives ?q= while the user is
 * on /search.
 */

import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Search } from '@/components/Icons';
import { PageHeader } from '@/components/ui/pane-header';
import { SearchResultsSurface } from '@/components/search/SearchResultsSurface';
import { OrderFullPageView } from '@/components/shipped/OrderFullPageView';
import { isTabId, type TabId } from '@/components/search/search-tabs';
import { usePageHeaderSearch } from '@/hooks/usePageHeader';
import { useNearMatchPackout } from '@/hooks/useNearMatchPackout';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { cn } from '@/utils/_cn';

/** Cap the per-row packout hydration to the top near-matches (bounded fetches). */
const RAIL_HYDRATE_LIMIT = 6;

export function SearchWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = (searchParams.get('q') ?? '').trim();
  const rawType = (searchParams.get('type') ?? 'all').toLowerCase();
  const tab: TabId = isTabId(rawType) ? rawType : 'all';
  const openOrderIdRaw = searchParams.get('openOrderId');
  const openOrderId =
    openOrderIdRaw && /^\d+$/.test(openOrderIdRaw) ? Number(openOrderIdRaw) : null;

  // The Orders category IS the rep order-lookup workbench.
  const isWorkbench = tab === 'order';

  const [input, setInput] = useState(q);
  const [surfaceBusy, setSurfaceBusy] = useState(false);
  const [orderHits, setOrderHits] = useState<AiSearchHit[]>([]);

  // Keep the input in sync when the URL changes externally (⌘K handoff).
  useEffect(() => {
    setInput(q);
  }, [q]);

  const updateUrl = useCallback(
    (next: { q?: string; type?: TabId; openOrderId?: number | null }) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (next.q !== undefined) {
        if (next.q) sp.set('q', next.q);
        else sp.delete('q');
      }
      if (next.type !== undefined) {
        if (next.type === 'all') sp.delete('type');
        else sp.set('type', next.type);
      }
      if (next.openOrderId !== undefined) {
        if (next.openOrderId) sp.set('openOrderId', String(next.openOrderId));
        else sp.delete('openOrderId');
      }
      router.replace(`/search?${sp.toString()}`);
    },
    [router, searchParams],
  );

  // The global header pill IS the /search input while this page is mounted.
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

  // Rail rows: hydrate the top near-matches with real packout proof (photos ·
  // packer · scan-out/packed time) via the existing order-row fetch — no new
  // endpoint, degrade-to-nothing on failure.
  const packoutIds = useMemo(
    () =>
      isWorkbench
        ? orderHits
            .filter((h) => h.entityType === 'order')
            .slice(0, RAIL_HYDRATE_LIMIT)
            .map((h) => h.id)
        : [],
    [isWorkbench, orderHits],
  );
  const packoutById = useNearMatchPackout(packoutIds);

  const handleResults = useCallback((hits: AiSearchHit[]) => {
    setOrderHits(hits);
  }, []);

  // Intercept order row clicks → open in place (no navigate). Non-order hits
  // (defensive; the Orders tab lists only orders) keep their <Link> navigation.
  const handleSelectHit = useCallback(
    (hit: AiSearchHit, event: ReactMouseEvent) => {
      if (hit.entityType !== 'order') return;
      event.preventDefault();
      updateUrl({ openOrderId: hit.id });
    },
    [updateUrl],
  );

  // Selection is mode-scoped: leaving Orders clears the open order so it can't
  // bleed into another category.
  const handleTabChange = useCallback(
    (t: TabId) => {
      updateUrl({ type: t, openOrderId: t === 'order' ? undefined : null });
    },
    [updateUrl],
  );

  // Auto-open the top match so an identifier query lands on the order detail
  // immediately. Only when the current selection is empty or has dropped out of
  // the latest results — never override a match the rep explicitly picked.
  useEffect(() => {
    if (!isWorkbench || orderHits.length === 0) return;
    if (openOrderId && orderHits.some((h) => h.id === openOrderId)) return;
    const top = orderHits.find((h) => h.entityType === 'order');
    if (top) updateUrl({ openOrderId: top.id });
  }, [isWorkbench, orderHits, openOrderId, updateUrl]);

  const detailPane = useMotionPresence(framerPresence.workbenchPane);
  const detailTransition = useMotionTransition(framerTransition.workbenchPaneMount);

  const surface = (
    <SearchResultsSurface
      scope="global"
      query={q}
      activeTab={tab}
      onTabChange={handleTabChange}
      onLoadingChange={setSurfaceBusy}
      onSelectHit={isWorkbench ? handleSelectHit : undefined}
      onResults={isWorkbench ? handleResults : undefined}
      activeHitId={isWorkbench ? openOrderId : null}
      packoutById={isWorkbench ? packoutById : undefined}
    />
  );

  if (!isWorkbench) {
    return (
      <>
        <PageHeader title="Search" maxWidth="5xl" />
        <div className="mx-auto w-full max-w-5xl flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {surface}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Search" />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Near-match rail (the stable map). Hidden on small screens once a
            detail is open — list OR detail, never a cramped two-up. */}
        <div
          className={cn(
            'w-full shrink-0 overflow-y-auto px-4 py-4 lg:w-[26rem] lg:border-r lg:border-border-hairline xl:w-[30rem]',
            openOrderId ? 'hidden lg:block' : 'block',
          )}
        >
          {surface}
        </div>

        {/* Detail pane (the workspace). Crossfades on selection change; the rail
            stays mounted and still. */}
        <div
          className={cn(
            'relative min-w-0 flex-1',
            openOrderId ? 'block' : 'hidden lg:block',
          )}
        >
          <AnimatePresence initial={false} mode="wait">
            {openOrderId ? (
              <motion.div
                key={`order-${openOrderId}`}
                initial={detailPane.initial}
                animate={detailPane.animate}
                exit={detailPane.exit}
                transition={detailTransition}
                className="absolute inset-0 flex min-h-0 flex-col overflow-hidden"
              >
                <OrderFullPageView orderId={String(openOrderId)} layout="workbench" />
              </motion.div>
            ) : (
              <div key="empty" className="flex h-full items-center justify-center p-8">
                <div className="max-w-sm rounded-xl border border-dashed border-border-soft bg-surface-canvas px-6 py-10 text-center">
                  <Search className="mx-auto mb-2 h-6 w-6 text-text-faint" />
                  <p className="text-sm font-semibold text-text-muted">Find a customer&apos;s order</p>
                  <p className="text-role-caption font-medium text-text-soft">
                    Type an order #, tracking, serial, or customer to open its packout proof here.
                  </p>
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
