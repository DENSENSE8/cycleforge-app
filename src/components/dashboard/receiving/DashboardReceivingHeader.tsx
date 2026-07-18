'use client';

/**
 * Dashboard · Receiving chrome — the one pinned top bar for the Receiving mode
 * (`/dashboard?mode=inbound`). Sibling of {@link InboundWorkspaceHeader}: same
 * `WorkbenchChromeHeader` primitive, framed as the Triage/Unbox table tabs.
 *
 * Left:  Triage · Unbox tabs. The tab id maps onto the History `?sort=` value
 *        (`dashboard-receiving-tabs.ts`) — Triage = scanned order, Unbox =
 *        unboxed order — so the tab strip and the table's day-band axis never
 *        disagree (both read `?sort`).
 * Right: [⫶ per-tab filter | search field] | table controls portal.
 *
 * Filtering is per-tab: Triage exposes the carton-source scope (All / Unfound)
 * for the scan/identify step; Unbox drops it (unfound is a triage concern) and
 * keeps the search-field selector. Both ride the shared `rh_q` / `rh_field` /
 * `rh_scope` contract, so the table's query keys are unchanged.
 */

import { useCallback, useEffect, useMemo, useState, type Ref } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useIsFetching } from '@tanstack/react-query';
import { AlertTriangle, Layout } from '@/components/Icons';
import { WorkbenchChromeHeader } from '@/components/dashboard/workbench-shell';
import {
  WorkbenchFilterDivider,
  WorkbenchFilterGroupLabel,
  WorkbenchFilterMenuRow,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';
import { SearchField } from '@/design-system/primitives/SearchField';
import { useDebounce } from '@/hooks';
import {
  DASHBOARD_RECEIVING_TABS,
  dashboardReceivingSortDelta,
  dashboardReceivingTabFromSort,
  type DashboardReceivingTab,
} from './dashboard-receiving-tabs';
import {
  RECEIVING_HISTORY_SEARCH_FIELDS,
  RECEIVING_HISTORY_URL_PARAMS,
  getReceivingHistoryPlaceholder,
  normalizeReceivingHistorySearchField,
  normalizeReceivingHistorySearchScope,
  setReceivingHistoryUrlParams,
  type ReceivingHistorySearchScope,
} from '@/lib/receiving-history-search';

const SCOPE_ITEMS: { id: ReceivingHistorySearchScope; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'all', label: 'All', icon: Layout },
  { id: 'unmatched', label: 'Unfound', icon: AlertTriangle },
];

interface DashboardReceivingHeaderProps {
  controlsSlotRef?: Ref<HTMLDivElement>;
  className?: string;
}

export function DashboardReceivingHeader({ controlsSlotRef, className }: DashboardReceivingHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tab: DashboardReceivingTab = dashboardReceivingTabFromSort(searchParams.get('sort'));
  const searchField = useMemo(
    () => normalizeReceivingHistorySearchField(searchParams.get(RECEIVING_HISTORY_URL_PARAMS.field)),
    [searchParams],
  );
  const searchScope = useMemo(
    () => normalizeReceivingHistorySearchScope(searchParams.get(RECEIVING_HISTORY_URL_PARAMS.scope)),
    [searchParams],
  );

  const replaceParams = useCallback(
    (next: URLSearchParams) => {
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  // Draft → debounced `?rh_q=` (deep links hydrate the field on mount).
  const urlQRaw = searchParams.get(RECEIVING_HISTORY_URL_PARAMS.q) ?? '';
  const [draft, setDraft] = useState(urlQRaw);
  useEffect(() => {
    setDraft(urlQRaw);
  }, [urlQRaw]);
  const debouncedDraft = useDebounce(draft, 250);
  useEffect(() => {
    if (debouncedDraft.trim() === urlQRaw.trim()) return;
    replaceParams(setReceivingHistoryUrlParams(searchParams, { q: debouncedDraft }));
  }, [debouncedDraft, replaceParams, searchParams, urlQRaw]);

  const setTab = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams.toString());
      const delta = dashboardReceivingSortDelta(id as DashboardReceivingTab);
      if (delta === null) next.delete('sort');
      else next.set('sort', delta);
      // Switching to Unbox clears the Triage-only Unfound scope so it never
      // leaks into a tab that doesn't offer it.
      if (id === 'unbox' && searchScope !== 'all') next.delete(RECEIVING_HISTORY_URL_PARAMS.scope);
      replaceParams(next);
    },
    [replaceParams, searchParams, searchScope],
  );

  const setScope = useCallback(
    (id: string) => {
      replaceParams(
        setReceivingHistoryUrlParams(searchParams, {
          scope: normalizeReceivingHistorySearchScope(id),
        }),
      );
    },
    [replaceParams, searchParams],
  );

  const setField = useCallback(
    (id: string) => {
      replaceParams(
        setReceivingHistoryUrlParams(searchParams, {
          field: normalizeReceivingHistorySearchField(id),
        }),
      );
    },
    [replaceParams, searchParams],
  );

  const clearFilters = useCallback(() => {
    replaceParams(setReceivingHistoryUrlParams(searchParams, { scope: 'all', field: 'all' }));
  }, [replaceParams, searchParams]);

  const tabs = useMemo(
    () =>
      DASHBOARD_RECEIVING_TABS.map((t) => ({
        id: t.id as string,
        label: t.label,
        color: 'blue' as const,
      })),
    [],
  );

  const tableFetching =
    useIsFetching({
      predicate: (u) => Array.isArray(u.queryKey) && u.queryKey[0] === 'receiving-lines-table',
    }) > 0;

  const [filterOpen, setFilterOpen] = useState(false);
  // Scope (Triage only) + field each count as one refinement; a hot filter dots
  // the trigger. Unbox never shows the scope, so only `field` counts there.
  const scopeHot = tab === 'triage' && searchScope !== 'all';
  const filterHot = scopeHot || searchField !== 'all';

  return (
    <WorkbenchChromeHeader
      tabs={tabs}
      activeTab={tab}
      onTabChange={setTab}
      solidTone="accent"
      controlsSlotRef={controlsSlotRef}
      controlsSlotProps={{ 'data-inbound-controls': '' }}
      className={className}
      search={
        <SearchField
          value={draft}
          onChange={setDraft}
          onSearch={(v) => {
            setDraft(v);
            replaceParams(setReceivingHistoryUrlParams(searchParams, { q: v }));
          }}
          onClear={() => {
            setDraft('');
            replaceParams(setReceivingHistoryUrlParams(searchParams, { q: '' }));
          }}
          placeholder={getReceivingHistoryPlaceholder(searchField).replace(/^Search/, 'Filter')}
          isSearching={tableFetching}
          tone="blue"
          size="compact"
          className="w-40 shrink-0 lg:w-56"
        />
      }
      right={
        <WorkbenchFilterPopover
          open={filterOpen}
          onOpenChange={setFilterOpen}
          hot={filterHot}
          label={tab === 'triage' ? 'Carton source / search field' : 'Search field'}
        >
          {tab === 'triage' ? (
            <>
              <WorkbenchFilterGroupLabel>Carton source</WorkbenchFilterGroupLabel>
              {SCOPE_ITEMS.map(({ id, label, icon: Icon }) => (
                <WorkbenchFilterMenuRow
                  key={id}
                  label={label}
                  active={searchScope === id}
                  leading={<Icon className="h-3.5 w-3.5 shrink-0" />}
                  onClick={() => {
                    setScope(id);
                    setFilterOpen(false);
                  }}
                />
              ))}
              <WorkbenchFilterDivider />
            </>
          ) : null}

          <WorkbenchFilterGroupLabel>Search field</WorkbenchFilterGroupLabel>
          {RECEIVING_HISTORY_SEARCH_FIELDS.map((field) => (
            <WorkbenchFilterMenuRow
              key={field.id}
              label={field.label}
              active={searchField === field.id}
              onClick={() => {
                setField(field.id);
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
                  clearFilters();
                  setFilterOpen(false);
                }}
              />
            </>
          ) : null}
        </WorkbenchFilterPopover>
      }
    />
  );
}
