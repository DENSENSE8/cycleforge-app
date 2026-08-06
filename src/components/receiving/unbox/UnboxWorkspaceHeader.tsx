'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode, type Ref } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  WorkbenchChromeHeader,
  WorkbenchTrailingCluster,
  WorkbenchTriageBand,
  WORKBENCH_CHROME_PILL_CLASS,
} from '@/components/dashboard/workbench-shell';
import {
  WorkbenchKpiBand,
  WorkbenchKpiCollapseToggle,
  WORKBENCH_KPI_SURFACE,
} from '@/components/dashboard/workbench-kpi-collapse';
import { useWorkbenchKpiCollapsed } from '@/hooks/useWorkbenchKpiCollapsed';
import {
  WorkbenchFilterDivider,
  WorkbenchFilterGroupLabel,
  WorkbenchFilterMenuRow,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';
import { StaffFilterButton } from '@/components/ui/StaffFilterButton';
import { Button, IconButton } from '@/design-system/primitives';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { ReceivingModeUnbox } from '@/components/icons/stations';
import { Printer } from '@/components/icons/media';
import { ColumnsTwo } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { printReturnsBinLabel } from '@/lib/print/printReturnsBinLabel';
import { parseStaffParam, useStaffFilter } from '@/hooks/useStaffFilter';
import { useWorkbenchSearchParam } from '@/hooks/useWorkbenchSearchParam';
import {
  HISTORY_SORT_OPTIONS,
  normalizeHistorySort,
} from '@/lib/receiving/receiving-modes';
import {
  RECEIVING_HISTORY_SEARCH_FIELDS,
  getReceivingHistoryPlaceholder,
  normalizeReceivingHistorySearchField,
  normalizeReceivingHistorySearchScope,
  setReceivingHistoryUrlParams,
} from '@/lib/receiving-history-search';
import {
  applyHistoryCommandFilterState,
  EMPTY_HISTORY_COMMAND_FILTER,
  HISTORY_REFINE_FACETS,
  HISTORY_REFINE_SOURCE_OPTIONS,
  HISTORY_REFINE_WEEK_OPTIONS,
  isHistoryCommandFilterHot,
  isHistoryRefineFacetHot,
  readHistoryCommandFilterState,
  type HistoryCommandFilterState,
  type HistoryRefineFacetId,
} from '@/lib/receiving/history-command-filter';
import { computeWeekRange, formatWeekRangeCompact } from '@/utils/date';
import { cn } from '@/utils/_cn';
import {
  classifyHistoryCommandScan,
  type HistoryCommandScanKind,
} from '@/lib/receiving/history-command-scan';
import {
  getDetailInspectorCollapsed,
  setDetailInspectorCollapsed,
  toggleDetailInspectorCollapsed,
  DETAIL_INSPECTOR_COLLAPSE_EVENT,
  type DetailInspectorCollapseDetail,
} from '@/design-system/shells/detail-stack';
import { useHistoryViewChromeOptional } from '@/components/receiving/history/history-view-chrome-context';
import { parseHistoryDrillLayout } from '@/lib/receiving/history-drill-layout';
import { TRIAGE_LANE_OPTS } from '@/lib/receiving/triage-lane-policy';
import { fetchUnboxOpenedRows } from '@/lib/receiving/rail/feeds';
import {
  UNBOX_WORKSPACE_TAB_LABEL,
  UNBOX_WORKSPACE_TABS,
  unboxKpiFeedTab,
  type UnboxWorkspaceTab,
} from '@/utils/unbox-workspace-state';
import { emitReceiving } from '@/components/receiving/receiving-events';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { ScanRoute } from '@/lib/barcode-routing';
import { UnboxChromeKpiCluster } from './UnboxChromeKpiCluster';

// Order is the SoT's (`UNBOX_WORKSPACE_TABS`): Urgent · Recent · Queue · All ·
// History, with the archive tab last (emerald, dividerBefore) after the working tabs.
const TABS: readonly UnboxWorkspaceTab[] = UNBOX_WORKSPACE_TABS;

const TAB_COLOR: Record<UnboxWorkspaceTab, 'red' | 'blue' | 'orange' | 'gray' | 'emerald'> = {
  urgent: 'red',
  recent: 'blue',
  queue: 'orange',
  all: 'gray',
  history: 'emerald',
};

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
  historyTriageOpen = false,
  className,
}: {
  tab: UnboxWorkspaceTab;
  onSelectTab: (
    tab: UnboxWorkspaceTab,
    opts?: { clearLine?: boolean },
  ) => void;
  controlsSlotRef?: Ref<HTMLDivElement>;
  /** Layout toggle + spreadsheet zoom — non-History tabs only (History View cluster). */
  compareChrome?: ReactNode;
  /** `detail:history` occupant registered — toggle parks without clearing target. */
  historyTriageOpen?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const staffId = parseStaffParam(searchParams.get('staff') ?? searchParams.get('staffId'));
  const { searchQuery, setSearch } = useWorkbenchSearchParam();
  const { collapsed: kpiCollapsed, setCollapsed: setKpiCollapsed } = useWorkbenchKpiCollapsed(
    WORKBENCH_KPI_SURFACE.unbox,
  );
  const historyViewChrome = useHistoryViewChromeOptional();
  const isHistoryTab = tab === 'history';
  const isQueueTab = tab === 'queue' || tab === 'urgent';
  const isAllTab = tab === 'all';
  const kpiFeedTab = unboxKpiFeedTab(tab);
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

  const historyFilter: HistoryCommandFilterState = useMemo(
    () => readHistoryCommandFilterState(searchParams),
    [searchParams],
  );
  const searchField = historyFilter.field;
  const historySort = historyFilter.sort;
  const historyScope = historyFilter.scope;
  const historyWeekOffset = historyFilter.weekOffset;
  const historyStaffId = historyFilter.staffId;
  const { options: staffOptions } = useStaffFilter();

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
  const urlQRaw = historyFilter.q;
  const setHistorySearch = useCallback(
    (q: string) => {
      replaceParams(setReceivingHistoryUrlParams(searchParams, { q }));
    },
    [replaceParams, searchParams],
  );

  const patchHistoryFilter = useCallback(
    (patch: Partial<HistoryCommandFilterState>) => {
      replaceParams(applyHistoryCommandFilterState(searchParams, patch));
    },
    [replaceParams, searchParams],
  );

  const setField = useCallback(
    (id: string) => {
      patchHistoryFilter({ field: normalizeReceivingHistorySearchField(id) });
    },
    [patchHistoryFilter],
  );

  const setSort = useCallback(
    (id: string) => {
      patchHistoryFilter({ sort: normalizeHistorySort(id) });
    },
    [patchHistoryFilter],
  );

  const setScope = useCallback(
    (id: string) => {
      patchHistoryFilter({ scope: normalizeReceivingHistorySearchScope(id) });
    },
    [patchHistoryFilter],
  );

  const setHistoryStaff = useCallback(
    (id: number | null) => {
      patchHistoryFilter({ staffId: id });
    },
    [patchHistoryFilter],
  );

  const setHistoryWeek = useCallback(
    (offset: number) => {
      patchHistoryFilter({ weekOffset: offset });
    },
    [patchHistoryFilter],
  );

  const clearHistoryFilters = useCallback(() => {
    replaceParams(
      applyHistoryCommandFilterState(searchParams, {
        q: historyFilter.q,
        field: EMPTY_HISTORY_COMMAND_FILTER.field,
        scope: EMPTY_HISTORY_COMMAND_FILTER.scope,
        sort: EMPTY_HISTORY_COMMAND_FILTER.sort,
        staffId: EMPTY_HISTORY_COMMAND_FILTER.staffId,
        weekOffset: EMPTY_HISTORY_COMMAND_FILTER.weekOffset,
      }),
    );
  }, [replaceParams, searchParams, historyFilter.q]);

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
  /** Active facet tab inside History Refine (Staff · Source · Field · Week). */
  const [refineFacet, setRefineFacet] = useState<HistoryRefineFacetId>('staff');
  const [inspectorCollapsed, setInspectorCollapsed] = useState(() => getDetailInspectorCollapsed());
  const historyFilterHot = isHistoryTab && isHistoryCommandFilterHot(historyFilter);
  const queueFilterHot = isQueueTab && (queueStage != null || queueLane != null);

  const setHistoryFilterOpen = useCallback((next: boolean) => {
    setFilterOpen(next);
    if (!next) setRefineFacet('staff');
  }, []);

  useEffect(() => {
    const onCollapse = (event: Event) => {
      const detail = (event as CustomEvent<DetailInspectorCollapseDetail>).detail;
      if (!detail || typeof detail.collapsed !== 'boolean') return;
      setInspectorCollapsed(detail.collapsed);
    };
    window.addEventListener(DETAIL_INSPECTOR_COLLAPSE_EVENT, onCollapse);
    return () => window.removeEventListener(DETAIL_INSPECTOR_COLLAPSE_EVENT, onCollapse);
  }, []);

  const toggleHistoryInspector = useCallback(() => {
    // No occupant yet — open View-only shell so layout / refine chrome is reachable.
    if (!historyTriageOpen) {
      historyViewChrome?.setViewShellOpen(true);
      setDetailInspectorCollapsed(false);
      setInspectorCollapsed(false);
      return;
    }
    toggleDetailInspectorCollapsed();
    setInspectorCollapsed(getDetailInspectorCollapsed());
  }, [historyTriageOpen, historyViewChrome]);

  // Cmd+\ (and bare `]`) parks / expands the History push inspector without
  // clearing `historyTriage` — filter URL edits keep the same target. When the
  // rail is closed, the same keys open the View-only shell.
  useEffect(() => {
    if (!isHistoryTab) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const isCmdBackslash =
        (e.metaKey || e.ctrlKey) && (e.key === '\\' || e.code === 'Backslash');
      const isBracket = !e.metaKey && !e.ctrlKey && !e.altKey && e.key === ']';
      if (!isCmdBackslash && !isBracket) return;
      e.preventDefault();
      toggleHistoryInspector();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isHistoryTab, toggleHistoryInspector]);

  // Esc park→clear lives on the History record-cursor publisher
  // (`ReceivingLinesTable` → `useRecordCursorKeyboard`).

  // Wedge → History command-row find (same `?rh_q=` as TechRailSearchBar).
  useEffect(() => {
    if (!isHistoryTab) return;
    const applyFind = (patch: Partial<HistoryCommandFilterState>) => {
      replaceParams(applyHistoryCommandFilterState(searchParams, patch));
    };
    const onWedge = (event: Event) => {
      const ce = event as CustomEvent<{ value?: string; route?: ScanRoute | null }>;
      const value = String(ce.detail?.value ?? '').trim();
      if (!value) return;
      const classified: HistoryCommandScanKind = classifyHistoryCommandScan(
        value,
        ce.detail?.route ?? null,
      );
      if (classified.kind === 'find') {
        event.preventDefault();
        applyFind({ q: classified.raw });
        return;
      }
      if (classified.kind === 'field') {
        event.preventDefault();
        applyFind({ q: classified.value, field: classified.field });
      }
      // station_command / open_carton / passthrough — leave to global routeScan
    };
    window.addEventListener('wedge-scan', onWedge);
    return () => window.removeEventListener('wedge-scan', onWedge);
  }, [isHistoryTab, replaceParams, searchParams]);

  const tabCount = (id: UnboxWorkspaceTab): number | undefined => {
    const n = id === 'queue' ? queueCount : id === 'recent' ? recentCount : undefined;
    // History is the whole station's archive — a count there is a database size,
    // not a workload, so it stays bare.
    return typeof n === 'number' && n > 0 ? n : undefined;
  };

  // History keeps the trailing divider (archive after working tabs) — same as
  // Testing / Pack. Do not use withScopeDivider (that put a hairline after Recent).
  const tabs = TABS.map((id) => ({
    id,
    label: UNBOX_WORKSPACE_TAB_LABEL[id],
    count: tabCount(id),
    color: TAB_COLOR[id],
    dividerBefore: id === 'history',
  }));

  // Band 3 — find left · refine right. History is the command-row golden:
  // flex-1 search + in-field Refine funnel (Staff · Source · Field · Week
  // as top labeled facet tabs — one body at a time). Sheet layout chrome
  // lives on the detail:history View topic cluster.
  const historyRefineBody = (() => {
    switch (refineFacet) {
      case 'staff':
        return (
          <>
            <WorkbenchFilterMenuRow
              label="All staff"
              active={historyStaffId == null}
              onClick={() => {
                setHistoryStaff(null);
                setHistoryFilterOpen(false);
              }}
            />
            {staffOptions.map((opt) => (
              <WorkbenchFilterMenuRow
                key={opt.id}
                label={opt.name}
                active={historyStaffId === opt.id}
                onClick={() => {
                  setHistoryStaff(opt.id);
                  setHistoryFilterOpen(false);
                }}
              />
            ))}
          </>
        );
      case 'source':
        return HISTORY_REFINE_SOURCE_OPTIONS.map((opt) => (
          <WorkbenchFilterMenuRow
            key={opt.id}
            label={opt.label}
            active={historyScope === opt.id}
            onClick={() => {
              setScope(opt.id);
              setHistoryFilterOpen(false);
            }}
          />
        ));
      case 'field':
        return RECEIVING_HISTORY_SEARCH_FIELDS.map((field) => (
          <WorkbenchFilterMenuRow
            key={field.id}
            label={field.label}
            active={searchField === field.id}
            onClick={() => {
              setField(field.id);
              setHistoryFilterOpen(false);
            }}
          />
        ));
      case 'week':
        return HISTORY_REFINE_WEEK_OPTIONS.map((opt) => {
          const range = computeWeekRange(opt.offset);
          const rangeLabel = formatWeekRangeCompact(range.startStr, range.endStr);
          const active = historyWeekOffset === opt.offset;
          return (
            <WorkbenchFilterMenuRow
              key={opt.offset}
              label={active ? `${opt.label} · ${rangeLabel}` : opt.label}
              active={active}
              onClick={() => {
                setHistoryWeek(opt.offset);
                setHistoryFilterOpen(false);
              }}
            />
          );
        });
    }
  })();

  const historyInFieldFilter = isHistoryTab ? (
    <WorkbenchFilterPopover
      open={filterOpen}
      onOpenChange={setHistoryFilterOpen}
      hot={historyFilterHot}
      label="Refine"
      density="field"
      contentClassName="w-72"
    >
      <div
        role="tablist"
        aria-label="Refine facets"
        className="flex gap-0.5 border-b border-border-default px-1"
      >
        {HISTORY_REFINE_FACETS.map((facet) => {
          const selected = refineFacet === facet.id;
          const facetHot = isHistoryRefineFacetHot(facet.id, historyFilter);
          return (
            <button
              key={facet.id}
              type="button"
              role="tab"
              aria-selected={selected}
              // Keep the popover open while switching facets.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setRefineFacet(facet.id)}
              className={cn(
                // ds-raw-button: compact facet tabs inside WorkbenchFilterPopover.
                'ds-raw-button relative flex-1 border-b-2 px-1.5 py-1.5 text-role-caption font-medium transition-colors',
                selected
                  ? 'border-blue-600 text-text-primary'
                  : 'border-transparent text-text-muted hover:text-text-primary',
              )}
            >
              {facet.label}
              {facetHot ? (
                <span
                  className="absolute right-0.5 top-1 h-1 w-1 rounded-full bg-blue-500"
                  aria-hidden
                />
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="max-h-64 overflow-y-auto py-0.5">{historyRefineBody}</div>
      {HISTORY_SORT_OPTIONS.length > 1 ? (
        <>
          <WorkbenchFilterDivider />
          <WorkbenchFilterGroupLabel>Sort by</WorkbenchFilterGroupLabel>
          {HISTORY_SORT_OPTIONS.map((opt) => (
            <WorkbenchFilterMenuRow
              key={opt.id}
              label={opt.label}
              active={historySort === opt.id}
              onClick={() => {
                setSort(opt.id);
                setHistoryFilterOpen(false);
              }}
            />
          ))}
        </>
      ) : null}
      {historyFilterHot ? (
        <>
          <WorkbenchFilterDivider />
          <WorkbenchFilterMenuRow
            label="Clear filters"
            active={false}
            onClick={() => {
              clearHistoryFilters();
              setHistoryFilterOpen(false);
            }}
          />
        </>
      ) : null}
    </WorkbenchFilterPopover>
  ) : null;

  const triageSearch = historyFindInParentMap ? null : isHistoryTab ? (
    <TechRailSearchBar
      variant="chrome"
      value={urlQRaw}
      onChange={setHistorySearch}
      placeholder={getReceivingHistoryPlaceholder(searchField).replace(/^Search/, 'Filter')}
      className="min-w-0 flex-1"
      trailingSuffix={historyInFieldFilter}
    />
  ) : (
    <TechRailSearchBar
      variant="chrome"
      value={searchQuery}
      onChange={setSearch}
      placeholder={
        tab === 'urgent'
          ? 'Filter urgent…'
          : tab === 'queue'
            ? 'Filter queue…'
            : tab === 'all'
              ? 'Search across types…'
              : 'Filter viewed…'
      }
      className="w-52 shrink-0 lg:w-64"
    />
  );

  const triageRight = (
    <>
      {tab !== 'recent' && !isAllTab ? <StaffFilterButton iconOnly align="end" /> : null}
      {isQueueTab && tab === 'queue' ? (
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
    </>
  );

  const historyInspectorToggle = isHistoryTab ? (
    <HoverTooltip
      label={
        !historyTriageOpen
          ? 'Show inspector'
          : inspectorCollapsed
            ? 'Show inspector'
            : 'Hide inspector'
      }
      asChild
    >
      <IconButton
        size="sm"
        tone="neutral"
        ariaLabel={
          !historyTriageOpen
            ? 'Show inspector'
            : inspectorCollapsed
              ? 'Show inspector'
              : 'Hide inspector'
        }
        aria-pressed={historyTriageOpen && !inspectorCollapsed}
        icon={<ColumnsTwo className="h-4 w-4" />}
        onClick={toggleHistoryInspector}
        data-testid="unbox-history-inspector-toggle"
      />
    </HoverTooltip>
  ) : null;

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
        KPI row — snap-collapsible Band 2 (`WorkbenchKpiBand`). Grok-like
        analytics canvas (`UnboxKpiCanvas` via UnboxChromeKpiCluster): time ·
        facets · viz toggle · charts; `?ukpi=` still filters the table.
        Persist collapse: staff_preferences.kpiCollapsed.unbox.
      */}
      <WorkbenchKpiBand
        open={!kpiCollapsed}
        onSnapCollapse={() => setKpiCollapsed(true)}
        onSnapExpand={() => setKpiCollapsed(false)}
      >
        <UnboxChromeKpiCluster mode={kpiFeedTab} />
      </WorkbenchKpiBand>
      {/*
        Band 3 — triage. History golden: find (+ in-field Refine: staff · scope ·
        field · week) + inspector park — View topics own layout chrome only
        (paint · drill · compare · zoom · ▦ · KPI). Other Unbox tabs keep Band 3
        refine + kpiToggle.
      */}
      <WorkbenchTriageBand
        search={triageSearch}
        right={
          isHistoryTab ? undefined : (
            <>
              {compareChrome}
              {triageRight}
            </>
          )
        }
        kpiToggle={
          isHistoryTab ? undefined : (
            <WorkbenchKpiCollapseToggle
              open={!kpiCollapsed}
              onToggle={() => setKpiCollapsed(!kpiCollapsed)}
            />
          )
        }
        trailing={historyInspectorToggle}
        controlsSlotRef={isHistoryTab ? undefined : controlsSlotRef}
        controlsSlotProps={
          isHistoryTab ? undefined : { 'data-unbox-controls': '' }
        }
        controlsSlotClassName={isHistoryTab ? undefined : 'contents'}
      />
    </div>
  );
}
