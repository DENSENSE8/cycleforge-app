'use client';

/**
 * Order lookup workbench. Two modes (URL `?mode=recent|search`, default recent):
 *
 *   • Recent — orders the operator opened (detail-stack history, kind=order)
 *   • Search — header-pill-driven order near-matches; selecting a hit navigates
 *     to Dashboard Search detail (`orderSearchHref` → `/dashboard?mode=search&openOrderId`)
 *
 * Legacy `/o/[id]?mode=search` redirects into Dashboard Search via OrderFullPageView.
 * Query typing lives in the always-global header pill; this panel never mounts
 * its own search band (sidebar-search-bar.guard).
 */

import { useCallback, useEffect, useMemo, type MouseEvent as ReactMouseEvent } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Box, Clock, Search, X } from '@/components/Icons';
import { SidebarShell } from '@/components/layout/SidebarShell';
import {
  HorizontalButtonSlider,
  type HorizontalSliderItem,
} from '@/components/ui/HorizontalButtonSlider';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { AiQuickJumpResults } from '@/components/search/AiQuickJumpResults';
import { SearchRecentsDropdown } from '@/components/search/SearchRecentsDropdown';
import { useAiQuickJump } from '@/hooks/useAiQuickJump';
import { useRecentDetailStacks } from '@/hooks/useRecentDetailStacks';
import { useSearchRecents } from '@/hooks/useSearchRecents';
import { removeDetailStack, type DetailStackEntry } from '@/lib/detail-stacks/history-store';
import { formatRelativeTime } from '@/lib/search/search-recents';
import { orderSearchHref } from '@/lib/search/search-hit';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import { cn } from '@/utils/_cn';

export type OrderWorkspaceMode = 'recent' | 'search';

const MODE_ITEMS: HorizontalSliderItem[] = [
  { id: 'recent', label: 'Recent', icon: Clock },
  { id: 'search', label: 'Search', icon: Search },
];

function parseMode(raw: string | null): OrderWorkspaceMode {
  return raw === 'search' ? 'search' : 'recent';
}

function currentOrderIdFromParams(orderIdParam: string | string[] | undefined): string | null {
  if (!orderIdParam) return null;
  const raw = Array.isArray(orderIdParam) ? orderIdParam[0] : orderIdParam;
  const decoded = decodeURIComponent(raw || '').trim();
  return decoded || null;
}

/** Prefer numeric DB id match; also accept human order-number path segments. */
function isSelectedEntry(entry: DetailStackEntry, currentId: string | null): boolean {
  if (!currentId) return false;
  return entry.id === currentId || entry.label.includes(currentId);
}

function hitMatchesCurrent(hit: AiSearchHit, currentId: string | null): boolean {
  if (!currentId) return false;
  if (String(hit.id) === currentId) return true;
  return hit.subtitle.includes(currentId) || hit.title.includes(currentId);
}

function relativeOpenedLabel(at: number): string {
  try {
    return formatRelativeTime(new Date(at).toISOString(), Date.now());
  } catch {
    return '';
  }
}

export function OrderWorkspaceSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useParams<{ orderId?: string }>();
  const currentOrderId = currentOrderIdFromParams(params?.orderId);

  const mode = parseMode(searchParams.get('mode'));
  const q = searchParams.get('q') ?? '';

  const setMode = useCallback(
    (next: string) => {
      if (next !== 'recent' && next !== 'search') return;
      const sp = new URLSearchParams(searchParams.toString());
      if (next === 'recent') sp.delete('mode');
      else sp.set('mode', next);
      // Mode switch clears search query so each mode opens clean.
      if (next === 'recent') sp.delete('q');
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const allStacks = useRecentDetailStacks();
  const orderRecents = useMemo(
    () => allStacks.filter((e) => e.kind === 'order'),
    [allStacks],
  );

  const { recents: searchRecents, remove: removeSearchRecent, clear: clearSearchRecents } =
    useSearchRecents({ scope: 'orders', limit: 8 });

  const { hits, searching } = useAiQuickJump(mode === 'search' ? q : '', {
    entityTypes: ['ORDER'],
    pageContext: pathname ?? '/o',
    limit: 12,
    enabled: mode === 'search',
  });

  const activeHitId = useMemo(() => {
    if (!currentOrderId || !/^\d+$/.test(currentOrderId)) return null;
    return Number(currentOrderId);
  }, [currentOrderId]);

  const openOrder = useCallback(
    (id: string, replace = false) => {
      const href = orderSearchHref(id, mode === 'search' ? q.trim() || undefined : undefined);
      // Recent mode: plain /o/id (no search map params).
      const target =
        mode === 'search' ? href : `/o/${encodeURIComponent(id)}`;
      if (replace) router.replace(target);
      else router.push(target);
    },
    [q, mode, router],
  );

  // Auto-open / canonicalize the top near-match so Enter lands on a real order
  // with the Search map populated — never leave a dangling identifier path when
  // retrieval already resolved the DB id.
  useEffect(() => {
    if (mode !== 'search' || searching) return;
    const orderHits = hits.filter((h) => h.entityType === 'order');
    if (orderHits.length === 0) return;

    const matched = orderHits.find((h) => hitMatchesCurrent(h, currentOrderId));
    if (matched) {
      // Path was a human order # / tracking — swap to numeric id for selection.
      if (currentOrderId !== String(matched.id)) {
        openOrder(String(matched.id), true);
      }
      return;
    }

    // No current selection in the result set → open the top match.
    openOrder(String(orderHits[0].id), true);
  }, [mode, searching, hits, currentOrderId, openOrder]);

  const handleSelectHit = useCallback(
    (hit: AiSearchHit, event: ReactMouseEvent) => {
      if (hit.entityType !== 'order') return;
      event.preventDefault();
      openOrder(String(hit.id));
    },
    [openOrder],
  );

  const modeRail = (
    <div className="shrink-0 border-b border-border-hairline px-2 py-1.5">
      <HorizontalButtonSlider
        items={MODE_ITEMS}
        value={mode}
        onChange={setMode}
        variant="nav"
        size="md"
        dense
        aria-label="Order workspace mode"
      />
    </div>
  );

  return (
    <SidebarShell headerAbove={modeRail} bodyClassName="pt-2 pb-6">
      {mode === 'recent' ? (
        <RecentOrdersList
          entries={orderRecents}
          currentOrderId={currentOrderId}
          onSelect={(entry) => openOrder(entry.id)}
        />
      ) : (
        <SearchOrdersBody
          query={q}
          hits={hits}
          searching={searching}
          activeHitId={activeHitId}
          onSelectHit={handleSelectHit}
          searchRecents={searchRecents}
          onSelectRecent={(query) => {
            router.push(orderSearchHref(query, query));
          }}
          onRemoveRecent={removeSearchRecent}
          onClearRecents={() => clearSearchRecents('orders')}
        />
      )}
    </SidebarShell>
  );
}

function RecentOrdersList({
  entries,
  currentOrderId,
  onSelect,
}: {
  entries: DetailStackEntry[];
  currentOrderId: string | null;
  onSelect: (entry: DetailStackEntry) => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas inset-empty text-center">
        <Box className="mx-auto mb-2 h-5 w-5 text-text-faint" />
        <p className="text-role-caption font-semibold text-text-muted">No recently opened orders</p>
        <p className="mt-1 text-role-micro font-medium text-text-faint">
          Orders you open here or from the dashboard will appear in this list.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border-hairline" aria-label="Recently opened orders">
      {entries.map((entry) => {
        const selected = isSelectedEntry(entry, currentOrderId);
        const when = relativeOpenedLabel(entry.at);
        return (
          <li key={`${entry.kind}:${entry.id}`}>
            <div
              className={cn(
                'group flex items-center gap-1 rounded-md transition-colors',
                selected ? 'bg-blue-50 ring-1 ring-inset ring-blue-400' : 'hover:bg-surface-hover',
              )}
            >
              {/* ds-raw-button: sidebar row — house list anatomy, not a DS Button */}
              <button
                type="button"
                onClick={() => onSelect(entry)}
                className="min-w-0 flex-1 px-2 py-1.5 text-left"
                aria-current={selected ? 'page' : undefined}
              >
                <p className="truncate text-role-caption font-bold text-text-default">{entry.label}</p>
                <p className="truncate text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
                  {when ? `Opened ${when}` : `Order · ${entry.id}`}
                </p>
              </button>
              <HoverTooltip label="Remove" focusable={false}>
                {/* ds-raw-button: quiet remove affordance */}
                <button
                  type="button"
                  onClick={() => removeDetailStack(entry.kind, entry.id)}
                  aria-label={`Remove ${entry.label}`}
                  className={cn(
                    'mr-1 shrink-0 rounded p-1 text-text-faint hover:text-text-default',
                    selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                  )}
                >
                  <X className="h-3 w-3" />
                </button>
              </HoverTooltip>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function SearchOrdersBody({
  query,
  hits,
  searching,
  activeHitId,
  onSelectHit,
  searchRecents,
  onSelectRecent,
  onRemoveRecent,
  onClearRecents,
}: {
  query: string;
  hits: AiSearchHit[];
  searching: boolean;
  activeHitId: number | null;
  onSelectHit: (hit: AiSearchHit, event: ReactMouseEvent) => void;
  searchRecents: ReturnType<typeof useSearchRecents>['recents'];
  onSelectRecent: (query: string) => void;
  onRemoveRecent: (id: string) => void;
  onClearRecents: () => void;
}) {
  const trimmed = query.trim();

  if (!trimmed) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas inset-empty text-center">
          <Search className="mx-auto mb-2 h-5 w-5 text-text-faint" />
          <p className="text-role-caption font-semibold text-text-muted">Find a customer&apos;s order</p>
          <p className="mt-1 text-role-micro font-medium text-text-faint">
            Type an order #, tracking, serial, or customer in the header search.
          </p>
        </div>
        <SearchRecentsDropdown
          recents={searchRecents}
          onSelect={(entry) => onSelectRecent(entry.query)}
          onRemove={onRemoveRecent}
          onClearAll={onClearRecents}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <AiQuickJumpResults
        hits={hits}
        searching={searching}
        density="compact"
        onNavigate={onSelectHit}
        activeId={activeHitId}
      />
      {!searching && hits.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas inset-empty text-center">
          <p className="text-role-caption font-semibold text-text-muted">No matching orders</p>
          <p className="mt-1 text-role-micro font-medium text-text-faint">
            Try a different order #, tracking, or serial.
          </p>
        </div>
      ) : null}
    </div>
  );
}
