'use client';

/**
 * Incoming workbench chrome — the golden `WorkbenchChromeHeader` recipe applied
 * to the Incoming right pane (the sibling of `InboundWorkspaceHeader` /
 * `OutboundWorkspaceHeader`). Replaces the cramped title+pagination `PaneHeader`
 * and pulls the sidebar's search + quick filters up into the top bar, the same
 * way the dashboard header owns them.
 *
 * Left:   purchasing-source tabs — All / Zoho / eBay. Each writes the server
 *         `?inbound=` facet (via `receiving-modes` → build-sql). A house hairline
 *         (`dividerBefore` on Zoho) fences the union tab off from the per-account
 *         tabs. The eBay tab shows only when the org has the eBay purchasing
 *         account wired in (Universal Incoming).
 * Right:  [⌕ search over ?rh_q] · [⫶ status / sort filter popover] · pagination ·
 *         [columns].
 *
 * Search + status/sort write the SAME URL params the sidebar and the list read
 * (`?rh_q` / `?state` / `?sort`), so the header, the sidebar, and the table can
 * never disagree. PO date-range + the by-carrier breakdown stay in the sidebar's
 * advanced filter dropdown (too wide for a header popover).
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { receivingSurfaceBasePath } from '@/lib/receiving/surface-path';
import { WorkbenchChromeHeader } from '@/components/dashboard/workbench-shell';
import {
  WorkbenchFilterDivider,
  WorkbenchFilterGroupLabel,
  WorkbenchFilterMenuRow,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';
import { PaneHeaderPagination } from '@/components/ui/pane-header';
import { ColumnConfigButton } from '@/components/ui/table-column-config/ColumnConfigButton';
import { ToolbarSearchToggle } from '@/components/ui/ToolbarSearchToggle';
import { useDebounce } from '@/hooks';
import { INCOMING_PAGE_SIZE } from '@/lib/receiving/receiving-modes';
import { INCOMING_SORT_LABELS, type IncomingSort } from '@/components/sidebar/receiving/IncomingPaneHeader';
import { RECEIVING_HISTORY_URL_PARAMS } from '@/lib/receiving-history-search';
import { useIncomingSummary } from './useIncomingSummary';
import { useIncomingFilters } from './useIncomingFilters';
import { TILES } from './incoming-tiles';

type IncomingSourceTab = 'all' | 'zoho' | 'ebay';

interface IncomingWorkspaceHeaderProps {
  /** Total matching rows across all pages (from `total` in the list response). */
  total: number;
  /** Current 1-based page index (`?page=`). */
  page: number;
}

export function IncomingWorkspaceHeader({
  total,
  page,
}: IncomingWorkspaceHeaderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const base = receivingSurfaceBasePath(pathname);
  const summary = useIncomingSummary();
  const filters = useIncomingFilters();
  // eBay is a purchasing source only once its account is connected (Universal
  // Incoming). Shares the 30s summary query the KPI strip uses (react-query
  // dedupes), so the tab appears/hides in lockstep with the eBay KPI.
  const universalIncoming = summary?.universal_incoming ?? false;

  const activeSource: IncomingSourceTab = (() => {
    const raw = (searchParams.get('inbound') || '').trim().toLowerCase();
    return raw === 'ebay' ? 'ebay' : raw === 'zoho' ? 'zoho' : 'all';
  })();

  const totalPages = Math.max(1, Math.ceil(total / INCOMING_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const setPage = useCallback(
    (next: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next <= 1) params.delete('page');
      else params.set('page', String(next));
      router.replace(`${base}?${params.toString()}`);
    },
    [router, searchParams, base],
  );

  const setSource = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id === 'all') params.delete('inbound');
      else params.set('inbound', id);
      // Changing the source changes the result set — start back at page 1.
      params.delete('page');
      router.replace(`${base}?${params.toString()}`);
    },
    [router, searchParams, base],
  );

  // Draft → debounced `?rh_q=` (deep links hydrate the field on mount). Mirrors
  // the Inbound header so a keystroke doesn't re-query the list on every letter.
  const urlQRaw = searchParams.get(RECEIVING_HISTORY_URL_PARAMS.q) ?? '';
  const [draft, setDraft] = useState(urlQRaw);
  useEffect(() => {
    setDraft(urlQRaw);
  }, [urlQRaw]);
  const debouncedDraft = useDebounce(draft, 250);
  useEffect(() => {
    if (debouncedDraft.trim() === urlQRaw.trim()) return;
    filters.setSearch(debouncedDraft);
  }, [debouncedDraft, urlQRaw, filters]);

  const [filterOpen, setFilterOpen] = useState(false);
  const filterHot = filters.activeFilterCount > 0;

  // eBay is a purchasing source only once the account is connected; otherwise
  // the surface is Zoho-only (All === Zoho) and the extra tab would sit empty.
  // `dividerBefore` on Zoho draws the house hairline that fences the union tab
  // (All) off from the per-integration tabs (Zoho / eBay).
  const tabs = [
    { id: 'all', label: 'All', color: 'blue' as const },
    { id: 'zoho', label: 'Zoho', color: 'teal' as const, dividerBefore: true },
    ...(universalIncoming
      ? [{ id: 'ebay', label: 'eBay', color: 'yellow' as const }]
      : []),
  ];

  // Status rows = the delivery-state tiles (skip the `null` "All issued" default;
  // the trigger's Clear row handles resetting). Counts come from the summary.
  const statusTiles = TILES.filter((t) => t.state != null);
  const sortKeys = Object.keys(INCOMING_SORT_LABELS) as IncomingSort[];

  return (
    <WorkbenchChromeHeader
      tabs={tabs}
      activeTab={activeSource}
      onTabChange={setSource}
      solidTone="accent"
      // Collapsible search icon (SoT dashboard chrome) — stays a single glyph
      // until used, so the right cluster never overflows the narrow pane and
      // pushes the columns button off-page. Draft → debounced `?rh_q=`.
      search={
        <ToolbarSearchToggle
          value={draft}
          onChange={setDraft}
          onClear={() => {
            setDraft('');
            filters.setSearch('');
          }}
          placeholder="Filter PO #, tracking, SKU…"
          tone="blue"
        />
      }
      right={
        <>
          <WorkbenchFilterPopover
            open={filterOpen}
            onOpenChange={setFilterOpen}
            hot={filterHot}
            label="Status / sort"
          >
            <WorkbenchFilterGroupLabel>Status</WorkbenchFilterGroupLabel>
            {statusTiles.map((tile) => {
              const active = filters.state === tile.state;
              const count = summary ? (summary[tile.key] as number | undefined) : undefined;
              const Icon = tile.icon;
              return (
                <WorkbenchFilterMenuRow
                  key={tile.label}
                  label={tile.label}
                  count={typeof count === 'number' ? count : undefined}
                  active={active}
                  leading={<Icon className="h-3.5 w-3.5 shrink-0" />}
                  onClick={() => {
                    filters.setState(active ? null : tile.state);
                    setFilterOpen(false);
                  }}
                />
              );
            })}

            <WorkbenchFilterDivider />

            <WorkbenchFilterGroupLabel>Sort</WorkbenchFilterGroupLabel>
            {sortKeys.map((key) => (
              <WorkbenchFilterMenuRow
                key={key}
                label={INCOMING_SORT_LABELS[key]}
                active={filters.sort === key}
                onClick={() => {
                  filters.setSort(key);
                  setFilterOpen(false);
                }}
              />
            ))}

            {filterHot ? (
              <>
                <WorkbenchFilterDivider />
                <WorkbenchFilterMenuRow
                  label="Clear filters"
                  active={false}
                  onClick={() => {
                    filters.clearFilters();
                    setFilterOpen(false);
                  }}
                />
              </>
            ) : null}
          </WorkbenchFilterPopover>

          <PaneHeaderPagination
            page={safePage}
            pageSize={INCOMING_PAGE_SIZE}
            total={total}
            onPrev={() => setPage(safePage - 1)}
            onNext={() => setPage(safePage + 1)}
          />
        </>
      }
      trailing={<ColumnConfigButton iconOnly />}
    />
  );
}
