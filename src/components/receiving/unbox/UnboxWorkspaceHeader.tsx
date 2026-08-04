'use client';

import { useCallback, useMemo, useState, type HTMLAttributes, type ReactNode, type Ref } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  WorkbenchChromeHeader,
  WorkbenchTrailingCluster,
  WORKBENCH_CHROME_PILL_CLASS,
  withScopeDivider,
} from '@/components/dashboard/workbench-shell';
import {
  WorkbenchFilterDivider,
  WorkbenchFilterGroupLabel,
  WorkbenchFilterMenuRow,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';
import { StaffFilterButton } from '@/components/ui/StaffFilterButton';
import { Button } from '@/design-system/primitives';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { ReceivingModeUnbox } from '@/components/icons/stations';
import { Printer } from '@/components/icons/media';
import { printReturnsBinLabel } from '@/lib/print/printReturnsBinLabel';
import { parseStaffParam } from '@/hooks/useStaffFilter';
import { useWorkbenchSearchParam } from '@/hooks/useWorkbenchSearchParam';
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
import { parseHistoryDrillLayout } from '@/lib/receiving/history-drill-layout';
import { TRIAGE_LANE_OPTS } from '@/lib/receiving/triage-lane-policy';
import { fetchUnboxOpenedRows } from '@/lib/receiving/rail/feeds';
import {
  UNBOX_WORKSPACE_TAB_LABEL,
  UNBOX_WORKSPACE_TABS,
  type UnboxWorkspaceTab,
} from '@/utils/unbox-workspace-state';
import { emitReceiving } from '@/components/receiving/receiving-events';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { UnboxChromeKpiCluster } from './UnboxChromeKpiCluster';
import { cn } from '@/utils/_cn';

/**
 * Row 2 — the data-table triage band: search pinned left, refine controls
 * (staff / stage / week) pinned right. Same shell tokens as row 1's
 * `WorkbenchChromeHeader band` face, but the opposite grouping — row 1 puts
 * everything after tabs on the right; this row deliberately splits its two
 * questions ("find" vs "refine") to opposite edges instead of clustering
 * them, since neither has a lifecycle-tab rail competing for the left side.
 *
 * Unbox-local for now (one consumer) — promote into `workbench-shell.tsx`
 * only when a second surface needs the same split-row shape.
 */
function UnboxTriageBand({
  search,
  right,
  compareChrome,
  historyDrillChrome,
  controlsSlotRef,
  controlsSlotProps,
}: {
  search: ReactNode;
  right: ReactNode;
  compareChrome?: ReactNode;
  /** History Drill | List — only when History + compare is single. */
  historyDrillChrome?: ReactNode;
  controlsSlotRef?: Ref<HTMLDivElement>;
  controlsSlotProps?: HTMLAttributes<HTMLDivElement> & Partial<Record<`data-${string}`, string>>;
}) {
  return (
    <div
      className={cn(
        // Flush sheet chrome: abut context rail (no left radius / border —
        // the rail owns the hairline). No top/bottom — KPI owns the seam
        // above; the sheet owns the seam below. One hairline per joint.
        // `pl-0` — flush to the sheet edge (search icon lives inside the
        // TechRailSearchBar field, not a separate select-gutter track).
        // No vertical pad — chrome search is a sunken plane edge-to-edge
        // with this row (not a floated pill).
        // History drill: search is null (find sits on the parent-map footer);
        // keep pl-0 so refine controls still align to the sheet edge.
        'flex h-10 min-w-0 shrink-0 items-stretch justify-between gap-2 border-r border-border-soft bg-surface-card pl-0 pr-0.5 shadow-sm',
      )}
    >
      <div className="flex min-w-0 shrink items-stretch">{search}</div>
      <div className="flex shrink-0 items-center gap-2 self-center">
        {historyDrillChrome}
        {compareChrome}
        {right}
        <div ref={controlsSlotRef} className="flex shrink-0 items-center gap-2" {...controlsSlotProps} />
      </div>
    </div>
  );
}

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
  compareChrome,
  historyDrillChrome,
  className,
}: {
  tab: UnboxWorkspaceTab;
  onSelectTab: (
    tab: UnboxWorkspaceTab,
    opts?: { clearLine?: boolean },
  ) => void;
  controlsSlotRef?: Ref<HTMLDivElement>;
  /** Layout toggle + spreadsheet zoom (Sheets / TradingView compare). */
  compareChrome?: ReactNode;
  /** History Drill | List (linked dual vs folded list). */
  historyDrillChrome?: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const staffId = parseStaffParam(searchParams.get('staff') ?? searchParams.get('staffId'));
  const { searchQuery, setSearch } = useWorkbenchSearchParam();
  const isHistoryTab = tab === 'history';
  const isQueueTab = tab === 'queue';
  // History drill seats find in the parent-map footer (`TechRailSearchBar`
  // rail) so the map matches receiving-rail anatomy — one find surface, not
  // chrome + footer. List mode keeps the chrome search.
  const historyDrillLayout = parseHistoryDrillLayout(searchParams.get('hlayout'));
  const historyFindInParentMap = isHistoryTab && historyDrillLayout === 'drill';
  // Return-to-scan CTA stays on every Unbox chrome tab (Recent · Queue ·
  // History). The button sits in Unbox's own chrome, so "go to Unbox" is not
  // what it can mean — the operator is already here. It RESUMES: it re-opens
  // the carton they most recently unboxed and re-arms the scan bar, so one
  // click gets them back to the work they left.
  //
  // It therefore does NOT land the bare data table (ruled 2026-08-03,
  // superseding the close-overlay-first sequence). Landing a table made the
  // click read as a no-op — the Recent table is `view=viewed` while the MRU
  // comes from `view=unbox_opened`, two different memberships, so the row
  // pulse it emitted frequently targeted a row that feed does not contain and
  // `useReceivingRowSelection` nulled the highlight on arrival. Nothing
  // visible happened except a tab change.
  //
  // SoT: display/workbench.md → Multi-region (every scan station).
  const handleReturnToUnbox = useCallback(() => {
    void (async () => {
      let mru: ReceivingLineRow | undefined;
      try {
        // The Unboxed rail's own feed (`view=unbox_opened`, SQL first-open
        // order), so row 0 IS the carton most recently opened at this bench —
        // and, being the rail's own descriptor, a row the rail can show.
        const rows = await fetchUnboxOpenedRows({ staffId });
        mru = rows[0];
      } catch {
        // Feed unreachable: still land the bench tab and re-arm the scan bar
        // rather than stranding the operator on the tab they clicked from.
        // Never close an open carton on this path — a failed lookup is not a
        // reason to throw away the work in front of them.
      }
      // Land the bench working set UNDERNEATH the carton, so Back to list
      // shows what the operator has touched. `clearLine: false` is
      // load-bearing: `setUnboxView` dispatches `receiving-clear-line` by
      // default, which would drop the pick made below — and, when the MRU is
      // already open, close it.
      onSelectTab('recent', { clearLine: false });
      if (mru) {
        // ONE signal serves both surfaces: the rail's `selectedId` is this
        // same record, so selecting the row opens the carton in the workspace
        // and marks it in the left sidebar rail together. A second
        // highlight/cursor signal here would be a second answer to drift.
        emitReceiving('receiving-select-line', { row: mru });
      }
      setTimeout(() => {
        emitReceiving('receiving-focus-scan');
      }, 60);
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

  // History tab: TechRailSearchBar owns the 250ms draft debounce → `?rh_q=`.
  const urlQRaw = searchParams.get(RECEIVING_HISTORY_URL_PARAMS.q) ?? '';
  const setHistorySearch = useCallback(
    (q: string) => {
      replaceParams(setReceivingHistoryUrlParams(searchParams, { q }));
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

  // Row 2 content — the data-table triage band. Always-open TechRailSearchBar
  // (same as sidebar footer) — not icon-first expand. Search answers "find";
  // staff/stage/lane/sort filters + week pill answer "refine" — the two
  // questions this row keeps apart from row 1's tabs/KPI/CTA.
  // History drill: find lives on the parent-map footer (`?rh_q=`) — omit here.
  const triageSearch = historyFindInParentMap ? null : isHistoryTab ? (
    <TechRailSearchBar
      variant="chrome"
      value={urlQRaw}
      onChange={setHistorySearch}
      placeholder={getReceivingHistoryPlaceholder(searchField).replace(/^Search/, 'Filter')}
      className="w-52 shrink-0 lg:w-64"
    />
  ) : (
    <TechRailSearchBar
      variant="chrome"
      value={searchQuery}
      onChange={setSearch}
      placeholder={tab === 'queue' ? 'Filter queue…' : 'Filter viewed…'}
      className="w-52 shrink-0 lg:w-64"
    />
  );

  const triageRight = (
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
  );

  return (
    <div className={cn('flex flex-col gap-0', className)}>
      {/*
        Row 1 — tabs (left) · return-to-scan CTA (right). Pinned chrome.
        Flush to context rail — no left radius / border (rail owns the hairline).
      */}
      <WorkbenchChromeHeader
        density="band"
        className="rounded-none border-l-0 border-t-0 shadow-sm"
        tabs={tabs}
        activeTab={tab}
        onTabChange={(id) => onSelectTab(id as UnboxWorkspaceTab)}
        solidTone="accent"
        trailing={
          /* Fields in host trailing — not portaled from ReceivingLinesTable
             (table-action-bar-fields PLAN Phase 2). Prefs: tableId `receiving`
             (History/Unbox); Incoming owns distinct `incoming`.
             Return-to-scan CTA: WorkbenchTrailingCluster.actions altitude
             (SoT: display/workbench.md → Multi-region — every scan station). */
          <WorkbenchTrailingCluster
            actions={
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Printer />}
                  ariaLabel="Print returns testing bin label"
                  onClick={() => printReturnsBinLabel()}
                  className={`${WORKBENCH_CHROME_PILL_CLASS} font-semibold uppercase tracking-widest`}
                >
                  Returns bin
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  icon={<ReceivingModeUnbox />}
                  ariaLabel="Unbox"
                  onClick={handleReturnToUnbox}
                  // Same soft pill as the band History tab (WORKBENCH_CHROME_PILL_CLASS).
                  className={`${WORKBENCH_CHROME_PILL_CLASS} font-semibold uppercase tracking-widest`}
                >
                  Unbox
                </Button>
              </>
            }
          />
        }
      />
      {/*
        KPI row — its own pinned row between tabs/CTA and the triage band, not
        squeezed into either. Big clickable KpiTile cards (UnboxChromeKpiCluster);
        clicking a filterable one narrows the table via `?ukpi=` (wired in
        ReceivingLinesTable). Replaced the body-mounted card strip
        (`UnboxKpiStrip`, deleted) so the operator reads + acts on attention
        state without scrolling past it.
      */}
      <div className="border-b border-r border-border-soft bg-surface-card px-3 py-2">
        <UnboxChromeKpiCluster mode={tab} />
      </div>
      {/*
        Row 2 — the data-table triage band. Search left, refine controls +
        the History week pill right. Shows on every tab (Recent/Queue/History
        all render the same grid) so the operator always has one place to
        reach for it.
      */}
      <UnboxTriageBand
        search={triageSearch}
        right={triageRight}
        historyDrillChrome={isHistoryTab ? historyDrillChrome : null}
        compareChrome={compareChrome}
        controlsSlotRef={controlsSlotRef}
        controlsSlotProps={{ 'data-unbox-controls': '' }}
      />
    </div>
  );
}
