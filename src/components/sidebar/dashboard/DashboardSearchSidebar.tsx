'use client';

/**
 * Dashboard · Search sidebar — Recent | Search hit map under the L2 rail.
 *
 * Query typing lives in the always-global header pill; this panel never mounts
 * its own search band. Selection writes `openOrderId` on `/dashboard?mode=search`
 * so the main pane shows Search order detail (not `/o` / shipped panel).
 */

import { useCallback, useMemo, type MouseEvent as ReactMouseEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
import { useStaffSearchRecents } from '@/hooks/useStaffSearchRecents';
import { removeDetailStack, type DetailStackEntry } from '@/lib/detail-stacks/history-store';
import { formatRelativeTime } from '@/lib/search/search-recents';
import { globalSearchHandoffHref } from '@/lib/search/search-hit';
import { DASHBOARD_SEARCH_RECENTS_SCOPE } from '@/components/dashboard/search/dashboard-search-recents';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import { cn } from '@/utils/_cn';

type DashboardSearchMapMode = 'recent' | 'search';

const MODE_ITEMS: HorizontalSliderItem[] = [
  { id: 'recent', label: 'Recent', icon: Clock },
  { id: 'search', label: 'Search', icon: Search },
];

function parseMap(raw: string | null): DashboardSearchMapMode {
  return raw === 'recent' ? 'recent' : 'search';
}

function isSelectedEntry(entry: DetailStackEntry, openOrderId: string | null): boolean {
  if (!openOrderId) return false;
  return entry.id === openOrderId || entry.label.includes(openOrderId);
}

function relativeOpenedLabel(at: number): string {
  try {
    return formatRelativeTime(new Date(at).toISOString(), Date.now());
  } catch {
    return '';
  }
}

export function DashboardSearchSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const openOrderId = (searchParams.get('openOrderId') ?? '').trim() || null;
  const q = searchParams.get('q') ?? '';
  const map = parseMap(searchParams.get('map'));

  const setMap = useCallback(
    (next: string) => {
      if (next !== 'recent' && next !== 'search') return;
      const sp = new URLSearchParams(searchParams.toString());
      sp.set('mode', 'search');
      if (next === 'recent') {
        sp.set('map', 'recent');
        sp.delete('q');
      } else {
        sp.set('map', 'search');
      }
      router.replace(`${pathname}?${sp.toString()}`);
    },
    [pathname, router, searchParams],
  );

  const allStacks = useRecentDetailStacks();
  const orderRecents = useMemo(
    () => allStacks.filter((e) => e.kind === 'order'),
    [allStacks],
  );

  const { recents: searchRecents, remove: removeSearchRecent, clear: clearSearchRecents } =
    useStaffSearchRecents({ scope: DASHBOARD_SEARCH_RECENTS_SCOPE });

  const { hits, searching } = useAiQuickJump(map === 'search' ? q : '', {
    // Unscoped: identifier queries keep the exact parent-table arm (orders +
    // receiving PO / tracking). ORDER-only scope skipped that arm and hid
    // Zoho PO / carton matches operators paste as "order #".
    pageContext: pathname ?? '/dashboard',
    limit: 12,
    enabled: map === 'search',
  });

  const activeHitId = useMemo(() => {
    if (!openOrderId || !/^\d+$/.test(openOrderId)) return null;
    return Number(openOrderId);
  }, [openOrderId]);

  const openOrder = useCallback(
    (id: string, replace = false) => {
      const sp = new URLSearchParams();
      sp.set('mode', 'search');
      sp.set('openOrderId', id);
      sp.set('map', map);
      const qTrim = q.trim();
      if (map === 'search' && qTrim) sp.set('q', qTrim);
      const target = `/dashboard?${sp.toString()}`;
      if (replace) router.replace(target);
      else router.push(target);
    },
    [q, map, router],
  );

  // Exact-match auto-open is owned solely by the main pane's
  // `useDashboardSearchOrder` (identifier resolve) + `onResults` (sole-hit) —
  // this sidebar is a pure navigation map, so nothing here races the URL.

  const handleSelectHit = useCallback(
    (hit: AiSearchHit, event: ReactMouseEvent) => {
      if (hit.entityType === 'order') {
        event.preventDefault();
        openOrder(String(hit.id));
        return;
      }
      // Receiving / unit / etc. — follow the hit deep-link (Unbox, inventory…).
      event.preventDefault();
      router.push(hit.href);
    },
    [openOrder, router],
  );

  const modeRail = (
    <div className="shrink-0 border-b border-border-hairline px-2 py-1.5">
      <HorizontalButtonSlider
        items={MODE_ITEMS}
        value={map}
        onChange={setMap}
        variant="nav"
        size="md"
        dense
        aria-label="Search map mode"
      />
    </div>
  );

  return (
    <SidebarShell headerAbove={modeRail} bodyClassName="pt-2 pb-6">
      {map === 'recent' ? (
        <RecentOrdersList
          entries={orderRecents}
          openOrderId={openOrderId}
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
            router.push(globalSearchHandoffHref(query, []));
          }}
          onRemoveRecent={removeSearchRecent}
          onClearRecents={() => void clearSearchRecents()}
        />
      )}
    </SidebarShell>
  );
}

function RecentOrdersList({
  entries,
  openOrderId,
  onSelect,
}: {
  entries: DetailStackEntry[];
  openOrderId: string | null;
  onSelect: (entry: DetailStackEntry) => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas inset-empty text-center">
        <Box className="mx-auto mb-2 h-5 w-5 text-text-faint" />
        <p className="text-role-caption font-semibold text-text-muted">No recently opened orders</p>
        <p className="mt-1 text-role-micro font-medium text-text-faint">
          Orders you open from Search will appear here.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border-hairline" aria-label="Recently opened orders">
      {entries.map((entry) => {
        const selected = isSelectedEntry(entry, openOrderId);
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
                aria-current={selected ? 'true' : undefined}
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
  searchRecents: ReturnType<typeof useStaffSearchRecents>['recents'];
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

  if (searching && hits.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas inset-empty text-center text-role-caption text-text-soft">
        Searching…
      </div>
    );
  }

  if (hits.length === 0) {
    return (
      <div className="space-y-2">
        <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas inset-empty text-center">
          <p className="text-role-caption font-semibold text-text-muted">No matches</p>
          <p className="mt-1 text-role-micro font-medium text-text-faint">
            Try a different order #, PO, tracking, or serial.
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
    </div>
  );
}
