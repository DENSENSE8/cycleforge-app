'use client';

import { useCallback, useEffect, useMemo, useState, type Ref } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useIsFetching } from '@tanstack/react-query';
import {
  WorkbenchChromeHeader,
  WorkbenchTrailingCluster,
  withScopeDivider,
} from '@/components/dashboard/workbench-shell';
import {
  WorkbenchFilterDivider,
  WorkbenchFilterGroupLabel,
  WorkbenchFilterMenuRow,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';
import { StaffFilterButton } from '@/components/ui/StaffFilterButton';
import { Button, ToolbarSearchToggle } from '@/design-system/primitives';
import { ReceivingModeUnbox } from '@/components/icons/stations';
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
import { TRIAGE_LANE_OPTS } from '@/lib/receiving/triage-lane-policy';
import { fetchUnboxOpenedRows } from '@/lib/receiving/rail/feeds';
import {
  UNBOX_WORKSPACE_TAB_LABEL,
  UNBOX_WORKSPACE_TABS,
  type UnboxWorkspaceTab,
} from '@/utils/unbox-workspace-state';
import { dispatchReceivingWorkspaceClose } from '@/utils/events';
import { emitReceiving } from '@/components/receiving/receiving-events';

// Order is the SoT's (`UNBOX_WORKSPACE_TABS`): Recent · Queue · History, with
// the archive tab last (emerald, dividerBefore) after the working tabs. Recent
// leads because it is the operator's own set — same placement Labels gives its
// recents tab.
const TABS: readonly UnboxWorkspaceTab[] = UNBOX_WORKSPACE_TABS;

const QUEUE_STAGE_OPTS = [
  { id: null, label: 'All' },
  { id: 'staged' as const, label: 'Staged' },
  { id: 'unstaged' as const, label: 'Not staged' },
];

export function UnboxWorkspaceHeader({
  tab,
  onSelectTab,
  controlsSlotRef,
  className,
}: {
  tab: UnboxWorkspaceTab;
  onSelectTab: (
    tab: UnboxWorkspaceTab,
    opts?: { clearLine?: boolean },
  ) => void;
  controlsSlotRef?: Ref<HTMLDivElement>;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const staffId = parseStaffParam(searchParams.get('staff') ?? searchParams.get('staffId'));
  const { searchQuery, setSearch } = useWorkbenchSearchParam();
  const isHistoryTab = tab === 'history';
  const isQueueTab = tab === 'queue';
  // Return-to-scan CTA stays on every Unbox chrome tab (Recent · Queue ·
  // History). Click always lands the Recent data table first — never the
  // carton overlay — so the workbench map stays visible while the scan bar
  // re-arms. SoT: display/workbench.md → Multi-region (every scan station).

  const handleReturnToUnbox = useCallback(() => {
    // 1) Close any carton overlay so UnboxWorkspaceView's data table is visible.
    dispatchReceivingWorkspaceClose();
    // 2) Recent is the first strip tab + the bench working set.
    onSelectTab('recent');
    void (async () => {
      try {
        // 3) Highlight the Unboxed-rail MRU in the Recent table when that row
        // is present — table row highlight only (no select-line → no overlay).
        const rows = await fetchUnboxOpenedRows({ staffId });
        const mru = rows[0];
        if (mru?.id != null) {
          emitReceiving('receiving-highlight-line', mru.id);
        }
      } finally {
        setTimeout(() => {
          emitReceiving('receiving-focus-scan');
        }, 60);
      }
    })();
  }, [onSelectTab, staffId]);

  const searchField = useMemo(
    () => normalizeReceivingHistorySearchField(searchParams.get(RECEIVING_HISTORY_URL_PARAMS.field)),
    [searchParams],
  );
  const historySort = useMemo(
    () => normalizeHistorySort(searchParams.get('sort')),
    [searchParams],
  );

  const ustageRaw = (searchParams.get('ustage') || '').trim().toLowerCase();
  const queueStage: 'staged' | 'unstaged' | null =
    ustageRaw === 'staged' || ustageRaw === 'unstaged' ? ustageRaw : null;
  const ulaneRaw = (searchParams.get('ulane') || '').trim().toUpperCase();
  const queueLane =
    TRIAGE_LANE_OPTS.some((o) => o.value === ulaneRaw)
      ? (ulaneRaw as (typeof TRIAGE_LANE_OPTS)[number]['value'])
      : null;

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

  const setQueueStage = useCallback(
    (id: 'staged' | 'unstaged' | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (id == null) next.delete('ustage');
      else next.set('ustage', id);
      replaceParams(next);
    },
    [replaceParams, searchParams],
  );

  const setQueueLane = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (id == null) next.delete('ulane');
      else next.set('ulane', id);
      replaceParams(next);
    },
    [replaceParams, searchParams],
  );

  const clearQueueFilters = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('ustage');
    next.delete('ulane');
    replaceParams(next);
  }, [replaceParams, searchParams]);

  // Lightweight queue depth for the Queue tab badge — separate key from the
  // KPI strip's 200-row metrics fetch so React Query doesn't collide. Include
  // staging facets so the badge matches the filtered table total.
  const { data: queueCount } = useQuery({
    queryKey: ['unbox-queue-badge', staffId ?? 'all', queueStage ?? 'all', queueLane ?? 'all'],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: '1',
        offset: '0',
        view: 'scanned',
        sort: 'priority',
      });
      if (staffId != null) params.set('staff', String(staffId));
      if (queueStage) params.set('ustage', queueStage);
      if (queueLane) params.set('ulane', queueLane);
      const res = await fetch(`/api/receiving-lines?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) return 0;
      const body = (await res.json()) as { total?: number; receiving_lines?: unknown[] };
      if (typeof body.total === 'number') return body.total;
      return Array.isArray(body.receiving_lines) ? body.receiving_lines.length : 0;
    },
    staleTime: 20_000,
  });

  // Recent depth for the Recent tab badge. Same shape as the queue badge above
  // (limit=1, read `total`) and the same reason it is a separate key: the KPI
  // strip's 200-row metrics fetch must not be re-keyed by a badge.
  //
  // `view=viewed` is the per-STAFF recents feed — scoped server-side by session,
  // which is why no staff param rides along. It is also why this badge moves on
  // its own: after 2026-08-01 a browse click on the feed no longer stamps a
  // view, so the number counts cartons the operator actually opened.
  const { data: recentCount } = useQuery({
    queryKey: ['unbox-recent-badge'],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '1', offset: '0', view: 'viewed' });
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
  const historyFilterHot = isHistoryTab && (searchField !== 'all' || historySort !== HISTORY_DEFAULT_SORT);
  const queueFilterHot = isQueueTab && (queueStage != null || queueLane != null);

  const tabCount = (id: UnboxWorkspaceTab): number | undefined => {
    const n = id === 'queue' ? queueCount : id === 'recent' ? recentCount : undefined;
    // History is the whole station's archive — a count there is a database size,
    // not a workload, so it stays bare.
    return typeof n === 'number' && n > 0 ? n : undefined;
  };

  // The hairline belongs to Recent's RIGHT edge: Recent is the operator's own
  // scope and Queue · History are the station's lists. `withScopeDivider` owns
  // that placement so Home's strip reads the same way.
  const tabs = withScopeDivider(
    TABS.map((id) => ({
      id,
      label: UNBOX_WORKSPACE_TAB_LABEL[id],
      count: tabCount(id),
      color: (id === 'queue' ? 'orange' : id === 'recent' ? 'blue' : 'emerald') as
        | 'blue'
        | 'orange'
        | 'emerald',
    })),
  );

  return (
    <WorkbenchChromeHeader
      density="band"
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => onSelectTab(id as UnboxWorkspaceTab)}
      solidTone="accent"
      controlsSlotRef={controlsSlotRef}
      controlsSlotProps={{ 'data-unbox-controls': '' }}
      className={className}
      search={
        isHistoryTab ? (
          <ToolbarSearchToggle
            value={draft}
            onChange={setDraft}
            onClear={() => {
              setDraft('');
              replaceParams(setReceivingHistoryUrlParams(searchParams, { q: '' }));
            }}
            placeholder={getReceivingHistoryPlaceholder(searchField).replace(/^Search/, 'Filter')}
            isSearching={tableFetching}
            tone="blue"
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
          {tab !== 'recent' ? <StaffFilterButton iconOnly align="end" /> : null}
          {isQueueTab ? (
            <WorkbenchFilterPopover
              open={filterOpen}
              onOpenChange={setFilterOpen}
              hot={queueFilterHot}
              label="Staging filters"
            >
              <WorkbenchFilterGroupLabel>Readiness</WorkbenchFilterGroupLabel>
              {QUEUE_STAGE_OPTS.map((opt) => (
                <WorkbenchFilterMenuRow
                  key={opt.id ?? 'all'}
                  label={opt.label}
                  active={queueStage === opt.id}
                  onClick={() => {
                    setQueueStage(opt.id);
                    setFilterOpen(false);
                  }}
                />
              ))}
              <WorkbenchFilterDivider />
              <WorkbenchFilterGroupLabel>Priority lane</WorkbenchFilterGroupLabel>
              <WorkbenchFilterMenuRow
                label="All lanes"
                active={queueLane == null}
                onClick={() => {
                  setQueueLane(null);
                  setFilterOpen(false);
                }}
              />
              {TRIAGE_LANE_OPTS.map((opt) => (
                <WorkbenchFilterMenuRow
                  key={opt.value}
                  label={opt.label}
                  active={queueLane === opt.value}
                  onClick={() => {
                    setQueueLane(opt.value);
                    setFilterOpen(false);
                  }}
                />
              ))}
              {queueFilterHot ? (
                <>
                  <WorkbenchFilterDivider />
                  <WorkbenchFilterMenuRow
                    label="Clear filters"
                    active={false}
                    onClick={() => {
                      clearQueueFilters();
                      setFilterOpen(false);
                    }}
                  />
                </>
              ) : null}
            </WorkbenchFilterPopover>
          ) : null}
          {isHistoryTab ? (
            <WorkbenchFilterPopover
              open={filterOpen}
              onOpenChange={setFilterOpen}
              hot={historyFilterHot}
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
              {historyFilterHot ? (
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
        /* Fields in host trailing — not portaled from ReceivingLinesTable
           (table-action-bar-fields PLAN Phase 2). Prefs: tableId `receiving`
           (History/Unbox); Incoming owns distinct `incoming`.
           Return-to-scan CTA: WorkbenchTrailingCluster.actions altitude
           (SoT: display/workbench.md → Multi-region — every scan station). */
        <WorkbenchTrailingCluster
          actions={
            <Button
              size="sm"
              variant="primary"
              icon={<ReceivingModeUnbox />}
              ariaLabel="Unbox"
              onClick={handleReturnToUnbox}
              className="rounded-full font-semibold uppercase tracking-widest"
            >
              Unbox
            </Button>
          }
        />
      }
    />
  );
}
