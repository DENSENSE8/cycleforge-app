'use client';

import { useCallback, useEffect, useMemo, useState, type Ref } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useIsFetching } from '@tanstack/react-query';
import { WorkbenchChromeHeader } from '@/components/dashboard/workbench-shell';
import {
  WorkbenchFilterDivider,
  WorkbenchFilterGroupLabel,
  WorkbenchFilterMenuRow,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';
import { BoardSelectToggle } from '@/components/board/BoardSelectToggle';
import { StaffFilterButton } from '@/components/ui/StaffFilterButton';
import { ToolbarSearchToggle } from '@/components/ui/ToolbarSearchToggle';
import { SearchField } from '@/design-system/primitives/SearchField';
import { parseStaffParam } from '@/hooks/useStaffFilter';
import { useWorkbenchSearchParam } from '@/hooks/useWorkbenchSearchParam';
import { useDebounce } from '@/hooks';
import {
  HISTORY_SORT_OPTIONS,
  HISTORY_DEFAULT_SORT,
  normalizeHistorySort,
} from '@/lib/receiving/receiving-modes';
import {
  RECEIVING_HISTORY_SEARCH_FIELDS,
  RECEIVING_HISTORY_URL_PARAMS,
  getReceivingHistoryPlaceholder,
  normalizeReceivingHistorySearchField,
  setReceivingHistoryUrlParams,
} from '@/lib/receiving-history-search';
import {
  UNBOX_WORKSPACE_TAB_LABEL,
  type UnboxWorkspaceTab,
} from '@/utils/unbox-workspace-state';

// Order mirrors TestingWorkspaceHeader — the history-like tab (History) sits
// rightmost (emerald, dividerBefore) after the active-work tabs (Queue, Viewed).
const TABS: UnboxWorkspaceTab[] = ['queue', 'viewed', 'recent'];

export function UnboxWorkspaceHeader({
  tab,
  onSelectTab,
  controlsSlotRef,
  selectMode = false,
  onToggleSelectMode,
  className,
}: {
  tab: UnboxWorkspaceTab;
  onSelectTab: (tab: UnboxWorkspaceTab) => void;
  controlsSlotRef?: Ref<HTMLDivElement>;
  selectMode?: boolean;
  onToggleSelectMode?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const staffId = parseStaffParam(searchParams.get('staff') ?? searchParams.get('staffId'));
  const { searchQuery, setSearch } = useWorkbenchSearchParam();
  const isHistoryTab = tab === 'recent';

  const searchField = useMemo(
    () => normalizeReceivingHistorySearchField(searchParams.get(RECEIVING_HISTORY_URL_PARAMS.field)),
    [searchParams],
  );
  const historySort = useMemo(
    () => normalizeHistorySort(searchParams.get('sort')),
    [searchParams],
  );

  const replaceParams = useCallback(
    (next: URLSearchParams) => {
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  // History tab: draft → debounced `?rh_q=` (Dashboard Receiving contract).
  const urlQRaw = searchParams.get(RECEIVING_HISTORY_URL_PARAMS.q) ?? '';
  const [draft, setDraft] = useState(urlQRaw);
  useEffect(() => {
    setDraft(urlQRaw);
  }, [urlQRaw]);
  const debouncedDraft = useDebounce(draft, 250);
  useEffect(() => {
    if (!isHistoryTab) return;
    if (debouncedDraft.trim() === urlQRaw.trim()) return;
    replaceParams(setReceivingHistoryUrlParams(searchParams, { q: debouncedDraft }));
  }, [debouncedDraft, isHistoryTab, replaceParams, searchParams, urlQRaw]);

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

  const setSort = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams.toString());
      const normalized = normalizeHistorySort(id);
      if (normalized === HISTORY_DEFAULT_SORT) next.delete('sort');
      else next.set('sort', normalized);
      replaceParams(next);
    },
    [replaceParams, searchParams],
  );

  const clearHistoryFilters = useCallback(() => {
    const next = setReceivingHistoryUrlParams(searchParams, { field: 'all' });
    next.delete('sort');
    replaceParams(next);
  }, [replaceParams, searchParams]);

  // Lightweight queue depth for the Queue tab badge — separate key from the
  // KPI strip's 200-row metrics fetch so React Query doesn't collide.
  const { data: queueCount } = useQuery({
    queryKey: ['unbox-queue-badge', staffId ?? 'all'],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: '1',
        offset: '0',
        view: 'scanned',
        sort: 'priority',
      });
      if (staffId != null) params.set('staff', String(staffId));
      const res = await fetch(`/api/receiving-lines?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) return 0;
      const body = (await res.json()) as { total?: number; receiving_lines?: unknown[] };
      if (typeof body.total === 'number') return body.total;
      return Array.isArray(body.receiving_lines) ? body.receiving_lines.length : 0;
    },
    staleTime: 20_000,
  });

  const tableFetching =
    useIsFetching({
      predicate: (u) => Array.isArray(u.queryKey) && u.queryKey[0] === 'receiving-lines-table',
    }) > 0;

  const [filterOpen, setFilterOpen] = useState(false);
  const filterHot = isHistoryTab && (searchField !== 'all' || historySort !== HISTORY_DEFAULT_SORT);

  const tabs = TABS.map((id) => ({
    id,
    label: UNBOX_WORKSPACE_TAB_LABEL[id],
    count: id === 'queue' && typeof queueCount === 'number' && queueCount > 0 ? queueCount : undefined,
    color: (id === 'queue' ? 'orange' : id === 'viewed' ? 'blue' : 'emerald') as
      | 'blue'
      | 'orange'
      | 'emerald',
    dividerBefore: id === 'recent',
  }));

  return (
    <WorkbenchChromeHeader
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => onSelectTab(id as UnboxWorkspaceTab)}
      solidTone="accent"
      controlsSlotRef={controlsSlotRef}
      controlsSlotProps={{ 'data-unbox-controls': '' }}
      className={className}
      search={
        isHistoryTab ? (
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
        ) : (
          <ToolbarSearchToggle
            value={searchQuery}
            onChange={setSearch}
            onClear={() => setSearch('')}
            placeholder={tab === 'queue' ? 'Filter queue…' : 'Filter viewed…'}
            tone="blue"
          />
        )
      }
      right={
        <>
          {tab !== 'viewed' ? <StaffFilterButton iconOnly align="end" /> : null}
          {isHistoryTab ? (
            <WorkbenchFilterPopover
              open={filterOpen}
              onOpenChange={setFilterOpen}
              hot={filterHot}
              label="Sort / search field"
            >
              <WorkbenchFilterGroupLabel>Sort by</WorkbenchFilterGroupLabel>
              {HISTORY_SORT_OPTIONS.map((opt) => (
                <WorkbenchFilterMenuRow
                  key={opt.id}
                  label={opt.label}
                  active={historySort === opt.id}
                  onClick={() => {
                    setSort(opt.id);
                    setFilterOpen(false);
                  }}
                />
              ))}
              <WorkbenchFilterDivider />
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
                      clearHistoryFilters();
                      setFilterOpen(false);
                    }}
                  />
                </>
              ) : null}
            </WorkbenchFilterPopover>
          ) : null}
        </>
      }
      trailing={
        onToggleSelectMode ? (
          <BoardSelectToggle active={selectMode} onToggle={onToggleSelectMode} />
        ) : undefined
      }
    />
  );
}
