'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  WorkbenchChromeHeader,
  WorkbenchTrailingCluster,
  WorkbenchTriageBand,
} from '@/components/dashboard/workbench-shell';
import {
  WorkbenchKpiBand,
  WorkbenchKpiCollapseToggle,
  WORKBENCH_KPI_SURFACE,
} from '@/components/dashboard/workbench-kpi-collapse';
import { useWorkbenchKpiCollapsed } from '@/hooks/useWorkbenchKpiCollapsed';
import {
  WORKBENCH_REFINE_BODY_CLASS,
  WorkbenchFilterDivider,
  WorkbenchFilterGroupLabel,
  WorkbenchFilterMenuRow,
  WorkbenchFilterPopover,
  WorkbenchRefineFacetTabs,
} from '@/components/dashboard/workbench-filter-popover';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { ReceivingModeUnbox } from '@/components/icons/stations';
import { ReceivingBoxChromeActions } from '@/components/receiving/ReceivingBoxChromeActions';
import {
  IncomingDeskRightRail,
  type IncomingDeskRailTool,
} from '@/components/sidebar/receiving/incoming/IncomingDeskRightRail';
import { parseStaffParam, useStaffFilter } from '@/hooks/useStaffFilter';
import { useWorkbenchSearchParam } from '@/hooks/useWorkbenchSearchParam';
import { useStaffPreferences } from '@/hooks/useStaffPreferences';
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
import {
  isUnboxPinCapReached,
  sanitizeUnboxPinnedExtraTabs,
  unboxExtraTabsAvailable,
  UNBOX_PINNED_EXTRA_TABS_MAX,
  type UnboxExtraTabId,
} from '@/lib/receiving/unbox-extra-tabs';
import { resolveUnboxPinnedTabs } from '@/lib/receiving/unbox-default-pins';
import { useUnboxDefaultPins } from '@/hooks/useUnboxDefaultPins';
import { computeWeekRange, formatWeekRangeCompact } from '@/utils/date';
import { cn } from '@/utils/_cn';
import {
  classifyHistoryCommandScan,
  type HistoryCommandScanKind,
} from '@/lib/receiving/history-command-scan';
import { WorkbenchInspectorToggle } from '@/components/dashboard/workbench-inspector-toggle';
import { WorkbenchViewsMenu } from '@/components/saved-views/WorkbenchViewsMenu';
import {
  SAVED_VIEW_PARAM_KEYS,
  SAVED_VIEW_STORAGE_KEY,
} from '@/lib/station/table-url-params';
import { NAV_KEY_HINT_CLASS, useNavRegion, type NavRegionId } from '@/lib/keyboard/nav-keys';
import { UNBOX_BAND3_NAV_KEY } from '@/lib/receiving/unbox-band3-nav-keys';
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
import { UnboxAddListPopover } from './UnboxAddListPopover';

// Order is the SoT's (`UNBOX_WORKSPACE_TABS`): Inbound · Queue · Recent ·
// History — the carton's own path, with the archive last (emerald,
// dividerBefore) after the working tabs.
const TABS: readonly UnboxWorkspaceTab[] = UNBOX_WORKSPACE_TABS;

const TAB_COLOR: Record<UnboxWorkspaceTab, 'red' | 'blue' | 'orange' | 'gray' | 'emerald'> = {
  incoming: 'blue',
  queue: 'orange',
  recent: 'blue',
  history: 'emerald',
  all: 'gray',
};

const QUEUE_STAGE_OPTS = [
  { id: null, label: 'All' },
  { id: 'staged' as const, label: 'Staged' },
  { id: 'unstaged' as const, label: 'Not staged' },
];

export function UnboxWorkspaceHeader({
  tab,
  onSelectTab,
  inspectorOpen = false,
  navRegionId,
  className,
}: {
  tab: UnboxWorkspaceTab;
  onSelectTab: (
    tab: UnboxWorkspaceTab,
    opts?: { clearLine?: boolean },
  ) => void;
  /**
   * A `detail:history` occupant is registered — a picked carton OR the
   * View-only shell. The toggle parks without clearing the target.
   */
  inspectorOpen?: boolean;
  /**
   * Opt this band into the leader-armed selection keyboard as the MIDDLE region
   * (`⌘;` → `m` → letter). `null` opts out — the host passes null while a
   * carton covers the browse, because `registerNavRegion` keys by region id and
   * the station bench is the other middle claimant.
   */
  navRegionId?: NavRegionId | null;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const staffId = parseStaffParam(searchParams.get('staff') ?? searchParams.get('staffId'));
  const { searchQuery, setSearch } = useWorkbenchSearchParam();
  const { collapsed: kpiCollapsed, setCollapsed: setKpiCollapsed, toggleCollapsed: toggleKpiCollapsed } =
    useWorkbenchKpiCollapsed(WORKBENCH_KPI_SURFACE.unbox);
  const historyViewChrome = useHistoryViewChromeOptional();
  const { prefs, update: updatePrefs } = useStaffPreferences();
  // Effective non-staff default (role → org → []) folded server-side; the chrome
  // layers the staffer's own pins on top so a fresh staffer inherits the org/role
  // template without a personal pin click (Gemini D9).
  const unboxDefaultPins = useUnboxDefaultPins();
  const pinnedExtraTabs = useMemo(
    () =>
      resolveUnboxPinnedTabs({
        // absent / null staff key = inherit the default; [] = staff cleared.
        staffPins: prefs?.unboxPinnedExtraTabs,
        orgDefault: unboxDefaultPins,
      }),
    [prefs?.unboxPinnedExtraTabs, unboxDefaultPins],
  );
  // Pins that are NOT already system tabs. `staff_preferences.unboxPinnedExtraTabs`
  // still carries `incoming` for every staffer who pinned Inbound before it was
  // promoted (2026-08-08); reading through this filter retires those rows without
  // a migration write, so nobody's stored prefs are mutated behind their back.
  const pinnedExtras = useMemo(
    () => pinnedExtraTabs.filter((id) => !UNBOX_WORKSPACE_TABS.includes(id)),
    [pinnedExtraTabs],
  );
  const availableExtraTabs = useMemo(
    // Offer only what is not already on the strip — system tab or existing pin —
    // so Inbound can never be re-pinned into a second copy of itself.
    () =>
      unboxExtraTabsAvailable(pinnedExtraTabs).filter(
        (e) => !UNBOX_WORKSPACE_TABS.includes(e.id),
      ),
    [pinnedExtraTabs],
  );
  // Band-1 hard cap: never more than UNBOX_PINNED_EXTRA_TABS_MAX pinned extras
  // (5 system tabs + this ≤ 7 max strip vocabulary — Gemini D2 · D14).
  const pinCapReached = isUnboxPinCapReached(pinnedExtraTabs);
  const isHistoryTab = tab === 'history';
  const isIncomingTab = tab === 'incoming';
  // Urgent stopped being a tab 2026-08-08 — it was this same queue with
  // `?priority_only=1`, and urgency is a flag a carton carries at any stage, not
  // a stage it sits in. Urgent cartons now pin to the top of these rows.
  const isQueueTab = tab === 'queue';
  const isAllTab = tab === 'all';
  /**
   * The receiving-sheet tabs — the ones whose grid is Unbox's own collection,
   * so the Band 3 lean row + the inspector View cluster apply. Pinned Inbound
   * is a foreign collection and is excluded by name, not by `!isIncomingTab`,
   * so a future pinned extra cannot silently inherit the inspector.
   */
  const isSheetTab =
    tab === 'queue' || tab === 'recent' || tab === 'history' || tab === 'all';
  const kpiFeedTab = unboxKpiFeedTab(tab);

  const pinExtraTab = useCallback(
    (id: UnboxExtraTabId) => {
      // Hard cap the write path too — a third pin never persists, independent of
      // the popover's disabled rows (Gemini D2 · D14).
      if (pinnedExtraTabs.length >= UNBOX_PINNED_EXTRA_TABS_MAX) return;
      const next = sanitizeUnboxPinnedExtraTabs([...pinnedExtraTabs, id]);
      updatePrefs({ unboxPinnedExtraTabs: next });
      onSelectTab(id);
    },
    [pinnedExtraTabs, updatePrefs, onSelectTab],
  );

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
  const { options: staffOptions, staffId: filterStaffId, setStaff } = useStaffFilter();

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
      // `count_only=1`, not `limit=1`: this route runs the list SQL alongside
      // the count, and `view=scanned` sorts on a joined column, so `limit=1`
      // still paid ~15 display laterals over the whole candidate set — 3513ms
      // measured on a cold load, for one integer. See the count_only arm in
      // src/app/api/receiving-lines/route.ts.
      const params = new URLSearchParams({
        limit: '1',
        offset: '0',
        count_only: '1',
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
      // count_only — same reason as the queue badge above. `view=viewed` was
      // the slowest request on a cold /unbox at 5767ms, for one integer.
      const params = new URLSearchParams({
        limit: '1',
        offset: '0',
        count_only: '1',
        view: 'viewed',
      });
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
  /** Active facet inside the non-History Refine funnel (Staff · Readiness · Lane). */
  const [triageFacet, setTriageFacet] = useState<'staff' | 'readiness' | 'lane'>('staff');
  /** Band 1 desk tools — one right-rail occupant (Check · Add). */
  const [deskRail, setDeskRail] = useState<IncomingDeskRailTool | null>(null);
  const historyFilterHot = isHistoryTab && isHistoryCommandFilterHot(historyFilter);
  const queueFilterHot = isQueueTab && (queueStage != null || queueLane != null);

  const setHistoryFilterOpen = useCallback((next: boolean) => {
    setFilterOpen(next);
    if (!next) setRefineFacet('staff');
  }, []);

  // Cmd+\ (and bare `]`) parks / expands the History push inspector without
  // clearing `historyTriage` — filter URL edits keep the same target. When the
  // rail is closed, the same keys open the View-only shell.
  // Both live in `WorkbenchInspectorToggle` (the desk SoT) — never re-hand-roll.
  const openHistoryViewShell = useCallback(() => {
    historyViewChrome?.setViewShellOpen(true);
  }, [historyViewChrome]);

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

  /**
   * A printed label scanned INTO the History find box.
   *
   * The `wedge-scan` handler above never fires here: the global listener bails
   * on editable focus, so the classifier this surface already wired is
   * unreachable the moment the operator clicks into the box it feeds. They
   * scanned a carton to OPEN it, not to search for the text of its label.
   *
   * Only a decoded handle arrives (a carrier number stays a text query and
   * filters normally), so this sends it exactly where the global wedge would
   * have: the route's own redirect.
   */
  const onFindFieldScan = useCallback(
    (route: ScanRoute) => {
      if (!route.redirect) return false;
      router.push(route.redirect);
      return true;
    },
    [router],
  );

  const tabCount = (id: UnboxWorkspaceTab): number | undefined => {
    const n = id === 'queue' ? queueCount : id === 'recent' ? recentCount : undefined;
    // History is the whole station's archive — a count there is a database size,
    // not a workload, so it stays bare.
    return typeof n === 'number' && n > 0 ? n : undefined;
  };

  // History keeps the trailing divider (archive after working tabs) — same as
  // Testing / Pack. Do not use withScopeDivider (that put a hairline after Recent).
  // Pinned catalog extras follow History with their own divider.
  const tabs = [
    ...TABS.map((id) => ({
      id,
      label: UNBOX_WORKSPACE_TAB_LABEL[id],
      count: tabCount(id),
      color: TAB_COLOR[id],
      dividerBefore: id === 'history',
    })),
    // A pin that has since been promoted to a SYSTEM tab is dropped here rather
    // than rendered twice. Inbound became the strip's first tab on 2026-08-08,
    // and it was the only entry in the pin catalog — so for every staffer who
    // had pinned it, a stale `unboxPinnedExtraTabs` value would otherwise put a
    // second Inbound after History, at the opposite end of the band from the
    // stage it represents. Filtering makes the stale pref inert on its own,
    // which is the migration; nothing has to be written back.
    ...pinnedExtras.map((id) => ({
      id,
      label: UNBOX_WORKSPACE_TAB_LABEL[id],
      count: undefined as number | undefined,
      color: TAB_COLOR[id],
      dividerBefore: id === pinnedExtras[0],
    })),
  ];

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
      <WorkbenchRefineFacetTabs
        facets={HISTORY_REFINE_FACETS.map((facet) => ({
          id: facet.id,
          label: facet.label,
          hot: isHistoryRefineFacetHot(facet.id, historyFilter),
        }))}
        activeId={refineFacet}
        onSelect={setRefineFacet}
      />
      <div className={WORKBENCH_REFINE_BODY_CLASS}>{historyRefineBody}</div>
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

  // ONE filter icon per field (ruled 2026-08-08). The staff facet used to be its
  // own `StaffFilterButton` glyph beside a second "Staging filters" funnel, so
  // Queue showed paste + 👤 + ▽ — three trailing glyphs on a row whose whole
  // point is that find carries it. Staff is now a FACET INSIDE the one Refine
  // funnel, exactly as History already does it: one glyph, labelled facet tabs,
  // one option body at a time.
  const triageRefineFacets = useMemo(() => {
    const facets: { id: 'staff' | 'readiness' | 'lane'; label: string }[] = [];
    if (tab !== 'recent' && !isAllTab) facets.push({ id: 'staff', label: 'Staff' });
    if (isQueueTab) {
      facets.push({ id: 'readiness', label: 'Readiness' });
      facets.push({ id: 'lane', label: 'Lane' });
    }
    return facets;
  }, [tab, isAllTab, isQueueTab]);

  const triageFacetHot = (id: 'staff' | 'readiness' | 'lane'): boolean => {
    if (id === 'staff') return filterStaffId != null;
    if (id === 'readiness') return queueStage != null;
    return queueLane != null;
  };

  const activeTriageFacet =
    triageRefineFacets.find((f) => f.id === triageFacet) ?? triageRefineFacets[0];

  // Nav keys — Band 3 opts into the ONE leader-armed selection keyboard as the
  // middle region (`⌘;` → `m` → letter). No new chord: `⌘F` / `/` were both
  // rejected — `/` because a printed Digital Link (`https://…/m/r/…`) makes a
  // wedge type it, and a second global binder because the chord registry has
  // exactly one owner per chord (`source-of-truth.md` → Nav keys · ⌘K).
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const navTargets = useMemo(
    () => [
      { id: 'find', preferredKey: UNBOX_BAND3_NAV_KEY.find },
      ...(triageRefineFacets.length
        ? [{ id: 'refine', preferredKey: UNBOX_BAND3_NAV_KEY.refine }]
        : []),
    ],
    [triageRefineFacets.length],
  );
  const { armed: navArmed, keymap: navKeymap } = useNavRegion({
    id: isIncomingTab ? null : navRegionId,
    targets: navTargets,
    onCommit: (targetId) => {
      if (targetId === 'find') {
        const el = findInputRef.current;
        el?.focus();
        el?.select();
        return;
      }
      if (targetId === 'refine') setFilterOpen(true);
    },
  });
  const navKeyCap = (targetId: string) => {
    if (!navArmed) return undefined;
    const key = navKeymap.get(targetId);
    return key ? <span className={NAV_KEY_HINT_CLASS}>{key}</span> : undefined;
  };

  const triageRefineBody = (() => {
    switch (activeTriageFacet?.id) {
      case 'staff':
        return (
          <>
            <WorkbenchFilterMenuRow
              label="All staff"
              active={filterStaffId == null}
              onClick={() => {
                setStaff(null);
                setFilterOpen(false);
              }}
            />
            {staffOptions.map((opt) => (
              <WorkbenchFilterMenuRow
                key={opt.id}
                label={opt.name}
                active={filterStaffId === opt.id}
                onClick={() => {
                  setStaff(opt.id);
                  setFilterOpen(false);
                }}
              />
            ))}
          </>
        );
      case 'readiness':
        return QUEUE_STAGE_OPTS.map((opt) => (
          <WorkbenchFilterMenuRow
            key={opt.id ?? 'all'}
            label={opt.label}
            active={queueStage === opt.id}
            onClick={() => {
              setQueueStage(opt.id);
              setFilterOpen(false);
            }}
          />
        ));
      case 'lane':
        return (
          <>
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
          </>
        );
      default:
        return null;
    }
  })();

  const triageInFieldFilter = triageRefineFacets.length ? (
    <>
    <WorkbenchFilterPopover
      open={filterOpen}
      onOpenChange={setFilterOpen}
      hot={triageRefineFacets.some((f) => triageFacetHot(f.id))}
      label="Refine"
      density="field"
      contentClassName="w-72"
    >
      <WorkbenchRefineFacetTabs
        facets={triageRefineFacets.map((facet) => ({
          id: facet.id,
          label: facet.label,
          hot: triageFacetHot(facet.id),
        }))}
        activeId={activeTriageFacet?.id}
        onSelect={setTriageFacet}
      />
      <div className={WORKBENCH_REFINE_BODY_CLASS}>{triageRefineBody}</div>
      {triageRefineFacets.some((f) => triageFacetHot(f.id)) ? (
        <>
          <WorkbenchFilterDivider />
          <WorkbenchFilterMenuRow
            label="Clear filters"
            active={false}
            onClick={() => {
              // Clears every facet the funnel owns — staff included, since it
              // no longer has its own glyph to clear itself from.
              setStaff(null);
              if (queueFilterHot) clearQueueFilters();
              setFilterOpen(false);
            }}
          />
        </>
      ) : null}
    </WorkbenchFilterPopover>
    {navKeyCap('refine')}
    </>
  ) : null;

  const triageSearch = historyFindInParentMap ? null : isHistoryTab ? (
    <TechRailSearchBar
      variant="chrome"
      value={urlQRaw}
      onChange={setHistorySearch}
      placeholder={getReceivingHistoryPlaceholder(searchField).replace(/^Search/, 'Filter')}
      className="min-w-0 flex-1"
      trailingSuffix={historyInFieldFilter}
      inputRef={findInputRef}
      onScanHandle={onFindFieldScan}
      navKeyHint={navKeyCap('find')}
    />
  ) : (
    <TechRailSearchBar
      variant="chrome"
      value={searchQuery}
      onChange={setSearch}
      placeholder={
        tab === 'queue'
          ? 'Filter queue…'
          : tab === 'all'
            ? 'Search across types…'
            : 'Filter viewed…'
      }
      className="min-w-0 flex-1"
      trailingSuffix={triageInFieldFilter}
      inputRef={findInputRef}
      navKeyHint={navKeyCap('find')}
    />
  );

  // Live on every receiving-sheet tab since 2026-08-08 — it is now the ONLY
  // door to the View cluster (compare layout · zoom · ▦), so gating it to
  // History would strand an operator in `?clayout=split` with no way back to
  // one pane. Deliberately NOT on the pinned Inbound tab: that grid is a
  // foreign collection whose ▦ writes a different prefs bucket, and
  // `detail:history` would race `detail:incoming` at equal rail priority.
  const inspectorToggle = (
    <WorkbenchInspectorToggle
      enabled={isSheetTab}
      open={inspectorOpen}
      onOpenEmpty={openHistoryViewShell}
      testId="unbox-history-inspector-toggle"
    />
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
        leading={
          <UnboxAddListPopover
            available={availableExtraTabs}
            atCap={pinCapReached}
            onPin={pinExtraTab}
          />
        }
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
                {/* Export is a TABLE action, History-only — the browse view is
                    the only tab a spreadsheet pull makes sense from. It rides
                    as a TAB of the one data cube, never its own glyph. */}
                <ReceivingBoxChromeActions
                  onCheck={() => setDeskRail({ kind: 'check', checkOnly: true })}
                  onAdd={() => setDeskRail({ kind: 'add', platform: 'amazon', leaf: 'index' })}
                  onExport={
                    tab === 'history'
                      ? () => emitReceiving('receiving-export-history')
                      : undefined
                  }
                  resumeLabel="Unbox"
                  resumeAriaLabel="Unbox"
                  resumeIcon={<ReceivingModeUnbox />}
                  onResume={handleReturnToUnbox}
                />
              </>
            }
          />
        }
      />
      {/*
        KPI row — instant snap-collapsible Band 2 (`WorkbenchKpiBand` — no
        height tween). Compact Usage strip via UnboxChromeKpiCluster;
        `?ukpi=` still filters the table.
        Persist collapse: staff_preferences.kpiCollapsed.unbox.
        Honest absence on pinned Inbound (foreign collection — not Unbox KPI).
      */}
      {!isIncomingTab ? (
        <WorkbenchKpiBand
          open={!kpiCollapsed}
          onSnapCollapse={() => setKpiCollapsed(true)}
          onSnapExpand={() => setKpiCollapsed(false)}
        >
          <UnboxChromeKpiCluster mode={kpiFeedTab} />
        </WorkbenchKpiBand>
      ) : null}
      {/*
        Band 3 — the LEAN row (ruled 2026-08-08). Exactly four things, on every
        receiving-sheet tab:

            [ 🔍 find …………………………… ▽ refine ]      [ ^ KPI ] [ ▥ inspector ]

        find · refine-INSIDE-the-find · KPI collapse · inspector park. Nothing
        else — no `right`, no controls portal. Everything that used to sit here
        (compare layout, spreadsheet zoom, ▦ column display, the week pill) now
        lives on the inspector's View cluster, which the trailing toggle opens;
        query facets ride in the field beside the query they refine.

        Why the row and not the panel keeps KPI: Band 3 is on screen when the
        inspector is parked, so a View-cluster twin would be unreachable exactly
        when it is wanted. One door.

        Inbound is honest absence — no search, no KPI band, no refine, no desk
        peek of its own, so it gets no band at all rather than a bare hairline.
      */}
      {isIncomingTab ? null : (
        <WorkbenchTriageBand
          search={triageSearch}
          views={
            isHistoryTab ? (
              <WorkbenchViewsMenu
                storageKey={SAVED_VIEW_STORAGE_KEY.receiving_history}
                paramKeys={SAVED_VIEW_PARAM_KEYS.receiving_history}
                emptyHint="No saved views yet — refine History, then save it here."
              />
            ) : null
          }
          kpiToggle={
            <WorkbenchKpiCollapseToggle
              open={!kpiCollapsed}
              onToggle={toggleKpiCollapsed}
            />
          }
          trailing={inspectorToggle}
        />
      )}

      <IncomingDeskRightRail tool={deskRail} onClose={() => setDeskRail(null)} />
    </div>
  );
}
