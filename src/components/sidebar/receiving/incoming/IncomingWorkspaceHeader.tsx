'use client';

/**
 * Inbound desk chrome — Pipeline POS table + Docked history.
 *
 * Unbox Sheets recipe (Incoming consumer):
 *   House Band-1 law: fixed process tabs · Pin-list omitted (L1 desk) · Views on
 *   Band 3 (`WorkbenchViewsMenu`) · page-pin in GlobalHeader.
 *
 *   Band 1 — Pipeline: Check / Import / Add (no collection pills — POS is the
 *            only face). Docked (`?lane=docked`): Arrival | Unbox
 *   Band 2 — omitted (KPI strip deleted 2026-08-10)
 *   Band 3 — triage find + Views + inspector
 *
 * Pipeline|Docked big tabs, Email Triage, the retired removed-lane facet, and
 * KPI tiles were deleted (rail-less ops-queue chrome). Docked remains
 * URL-reachable for legacy redirects.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { receivingSurfaceBasePath } from '@/lib/receiving/surface-path';
import {
  parseInboundLane,
  type InboundLane,
} from '@/lib/receiving/inbound-lane';
import { WorkbenchChromeHeader, WorkbenchTrailingCluster, WorkbenchTriageBand } from '@/components/dashboard/workbench-shell';
import { WorkbenchInspectorToggle } from '@/components/dashboard/workbench-inspector-toggle';
import { useRightRailOccupantOpen } from '@/components/right-rail/useRightRailOccupant';
import { INCOMING_DETAILS_RAIL_ID } from '@/components/sidebar/receiving/incoming-details/IncomingDetailsHeader';
import {
  WorkbenchFilterDivider,
  WorkbenchFilterGroupLabel,
  WorkbenchFilterMenuRow,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';
import { QueueSortSwitch } from '@/components/dashboard/QueueSortSwitch';
import { PaneHeaderPagination } from '@/components/ui/pane-header';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { ToolbarButton } from '@/components/ui/ToolbarButton';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { AlertTriangle, ExternalLink, Layout } from '@/components/Icons';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import { useAuth } from '@/contexts/AuthContext';
import { INCOMING_PAGE_SIZE } from '@/lib/receiving/receiving-modes';
import {
  INCOMING_SORT_OPTIONS,
  type IncomingSort,
} from '@/components/sidebar/receiving/IncomingPaneHeader';
import {
  RECEIVING_HISTORY_SEARCH_FIELDS,
  RECEIVING_HISTORY_URL_PARAMS,
  getReceivingHistoryPlaceholder,
  normalizeReceivingHistorySearchField,
  normalizeReceivingHistorySearchScope,
  setReceivingHistoryUrlParams,
  type ReceivingHistorySearchScope,
} from '@/lib/receiving-history-search';
import {
  DASHBOARD_RECEIVING_TABS,
  dashboardReceivingSortDelta,
  dashboardReceivingTabFromSort,
  type DashboardReceivingTab,
} from './inbound-docked-tabs';
import { IncomingSyncDialog } from '@/components/sidebar/receiving/IncomingSyncDialog';
import { useIncomingSummary } from './useIncomingSummary';
import { useIncomingFilters } from './useIncomingFilters';
import { useIncomingSyncActions } from './useIncomingSyncActions';
import { IncomingChromeActions } from './IncomingChromeActions';
import {
  IncomingDeskRightRail,
  type IncomingDeskRailTool,
} from './IncomingDeskRightRail';
import {
  IncomingSourceHotChip,
  IncomingSourceRows,
  type IncomingSource,
} from './IncomingSourceFilters';
import {
  IncomingKindHotChip,
  IncomingKindRows,
  type IncomingKind,
} from './IncomingKindFilters';
import { TILES, TONE } from './incoming-tiles';
import { WorkbenchViewsMenu } from '@/components/saved-views/WorkbenchViewsMenu';
import {
  SAVED_VIEW_PARAM_KEYS,
  SAVED_VIEW_STORAGE_KEY,
} from '@/lib/station/table-url-params';
import {
  GLOBAL_ADD_INTENT_EVENT,
  consumeGlobalAddIntent,
  type GlobalAddIntent,
} from '@/lib/global-add/catalog';

const SCOPE_ITEMS: {
  id: ReceivingHistorySearchScope;
  label: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  { id: 'all', label: 'All', icon: Layout },
  { id: 'unmatched', label: 'Unfound', icon: AlertTriangle },
];

interface IncomingWorkspaceHeaderProps {
  /** Total matching rows across all pages (from `total` in the list response). */
  total: number;
  /** Current 1-based page index (`?page=`). */
  page: number;
  /** Flush Band-1 face from WorkbenchSheetView — never re-type it here. */
  className?: string;
}

export function IncomingWorkspaceHeader({
  total,
  page,
  className,
}: IncomingWorkspaceHeaderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const base = receivingSurfaceBasePath(pathname);
  const summary = useIncomingSummary();
  const filters = useIncomingFilters();
  const sync = useIncomingSyncActions();
  const { has } = useAuth();
  const canImportEbay = has('integrations.ebay');
  const universalIncoming = summary?.universal_incoming ?? false;

  const lane: InboundLane = parseInboundLane(searchParams.get('lane'));
  const isPipeline = lane === 'pipeline';
  const incomingDetailOpen = useRightRailOccupantOpen(INCOMING_DETAILS_RAIL_ID);

  const [deskRail, setDeskRail] = useState<IncomingDeskRailTool | null>(null);

  const closeDeskRail = useCallback(() => {
    setDeskRail(null);
  }, []);

  useEffect(() => {
    const onStationImport = (event: Event) => {
      const detail = (event as CustomEvent<{ orderId?: string; order_id?: string }>).detail;
      const prefill = (detail?.orderId || detail?.order_id || '').trim();
      setDeskRail({
        kind: 'add',
        orderId: prefill,
        platform: 'ebay',
        leaf: 'add-po',
      });
    };
    window.addEventListener('station:import-ebay-order', onStationImport);
    return () => window.removeEventListener('station:import-ebay-order', onStationImport);
  }, []);

  useEffect(() => {
    const applyIntent = (intent: GlobalAddIntent | null) => {
      if (!intent) return;
      if (intent.kind === 'incoming-add') {
        setDeskRail({ kind: 'add', platform: 'amazon', leaf: intent.leaf });
        return;
      }
      if (intent.kind === 'incoming-import-zoho') {
        void sync.refreshZoho();
        return;
      }
      if (intent.kind === 'incoming-import-ebay') {
        void sync.refreshMarketplace();
      }
    };

    applyIntent(consumeGlobalAddIntent());

    const onGlobalAdd = (event: Event) => {
      const intent = (event as CustomEvent<GlobalAddIntent>).detail;
      if (!intent) return;
      consumeGlobalAddIntent();
      applyIntent(intent);
    };
    window.addEventListener(GLOBAL_ADD_INTENT_EVENT, onGlobalAdd);
    return () => window.removeEventListener(GLOBAL_ADD_INTENT_EVENT, onGlobalAdd);
  }, [sync]);

  const replaceParams = useCallback(
    (next: URLSearchParams) => {
      const qs = next.toString();
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [router, base],
  );

  const activeSource: IncomingSource = (() => {
    const raw = (searchParams.get('inbound') || '').trim().toLowerCase();
    if (raw === 'ebay' || raw === 'zoho' || raw === 'amazon' || raw === 'manual') return raw;
    return 'all';
  })();

  const activeKind: IncomingKind = (() => {
    const raw = (searchParams.get('inkind') || '').trim().toLowerCase();
    return raw === 'purchase' || raw === 'return' ? raw : 'all';
  })();

  const dockedTab: DashboardReceivingTab = dashboardReceivingTabFromSort(searchParams.get('sort'));
  const searchField = useMemo(
    () => normalizeReceivingHistorySearchField(searchParams.get(RECEIVING_HISTORY_URL_PARAMS.field)),
    [searchParams],
  );
  const searchScope = useMemo(
    () => normalizeReceivingHistorySearchScope(searchParams.get(RECEIVING_HISTORY_URL_PARAMS.scope)),
    [searchParams],
  );

  const totalPages = Math.max(1, Math.ceil(total / INCOMING_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const setPage = useCallback(
    (next: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next <= 1) params.delete('page');
      else params.set('page', String(next));
      replaceParams(params);
    },
    [replaceParams, searchParams],
  );

  const setSource = useCallback(
    (id: IncomingSource) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id === 'all') params.delete('inbound');
      else params.set('inbound', id);
      params.delete('page');
      replaceParams(params);
    },
    [replaceParams, searchParams],
  );

  const setKind = useCallback(
    (id: IncomingKind) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id === 'all') params.delete('inkind');
      else params.set('inkind', id);
      params.delete('page');
      replaceParams(params);
    },
    [replaceParams, searchParams],
  );

  const setDockedTab = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams.toString());
      const delta = dashboardReceivingSortDelta(id as DashboardReceivingTab);
      if (delta === null) next.delete('sort');
      else next.set('sort', delta);
      if (id === 'unbox' && searchScope !== 'all') next.delete(RECEIVING_HISTORY_URL_PARAMS.scope);
      replaceParams(next);
    },
    [replaceParams, searchParams, searchScope],
  );

  const urlQRaw = searchParams.get(RECEIVING_HISTORY_URL_PARAMS.q) ?? '';

  const setWorkbenchSearch = useCallback(
    (q: string) => {
      if (isPipeline) filters.setSearch(q);
      else replaceParams(setReceivingHistoryUrlParams(searchParams, { q }));
    },
    [filters, isPipeline, replaceParams, searchParams],
  );

  const [filterOpen, setFilterOpen] = useState(false);
  const filterHot = isPipeline
    ? Boolean(filters.dateRange?.from) ||
      filters.state != null ||
      activeSource !== 'all' ||
      activeKind !== 'all'
    : (dockedTab === 'triage' && searchScope !== 'all') || searchField !== 'all';

  const clearWorkbenchFilters = useCallback(() => {
    if (isPipeline) {
      filters.setDateRange(undefined);
      filters.setState(null);
      // Source + Kind are groups of this same funnel now, and they count toward
      // `filterHot` — clearing without them would leave the trigger lit with no
      // visible reason why.
      setSource('all');
      setKind('all');
    } else {
      replaceParams(setReceivingHistoryUrlParams(searchParams, { scope: 'all', field: 'all' }));
    }
  }, [filters, isPipeline, replaceParams, searchParams, setKind, setSource]);

  const dockedSubTabs = useMemo(
    () =>
      DASHBOARD_RECEIVING_TABS.map((t) => ({
        id: t.id as string,
        label: t.label,
        color: 'blue' as const,
      })),
    [],
  );

  /*
   * In-field refine (find-only Band 3) — Pipeline attention/date filters and
   * Docked carton-source / search-field pickers ride in the search bar
   * `trailingSuffix`, beside the source filter. The right zone keeps view
   * toggles only (pagination · sort · ▦ · KPI · inspector).
   */
  const incomingInFieldFilter = isPipeline ? (
            <WorkbenchFilterPopover
              open={filterOpen}
              onOpenChange={setFilterOpen}
              hot={filterHot}
              label="Filters"
              density="field"
              contentClassName="w-72 max-h-[min(70vh,32rem)] overflow-y-auto"
            >
              <IncomingSourceRows
                source={activeSource}
                onChange={setSource}
                onPick={() => setFilterOpen(false)}
              />

              <WorkbenchFilterDivider />

              <IncomingKindRows
                kind={activeKind}
                onChange={setKind}
                onPick={() => setFilterOpen(false)}
              />

              <WorkbenchFilterDivider />

              <WorkbenchFilterGroupLabel>PO purchased between</WorkbenchFilterGroupLabel>
              <div className="px-2 pb-2">
                <DateRangePickerField
                  value={filters.dateRange}
                  onChange={filters.setDateRange}
                  placeholder="Any date"
                />
                <p className="mt-1 text-role-eyebrow font-medium text-text-faint">
                  Date in header is when the PO was created
                </p>
              </div>

              <WorkbenchFilterDivider />

              <WorkbenchFilterGroupLabel>Attention</WorkbenchFilterGroupLabel>
              {TILES.map((tile) => {
                const id = tile.state ?? 'all_issued';
                const count = summary ? (summary[tile.key] as number | undefined) : undefined;
                const active =
                  tile.state == null ? filters.state === null : filters.state === tile.state;
                return (
                  <WorkbenchFilterMenuRow
                    key={id}
                    label={tile.label}
                    count={typeof count === 'number' ? count : undefined}
                    active={active}
                    leading={
                      <tile.icon
                        className={`h-3.5 w-3.5 shrink-0 ${
                          active ? 'text-blue-600' : TONE[tile.tone].iconInactive
                        }`}
                      />
                    }
                    onClick={() => {
                      if (tile.state == null) {
                        filters.setState(null);
                      } else {
                        filters.setState(filters.state === tile.state ? null : tile.state);
                      }
                      setFilterOpen(false);
                    }}
                  />
                );
              })}

              {filterHot ? (
                <>
                  <WorkbenchFilterDivider />
                  <WorkbenchFilterMenuRow
                    label="Clear filters"
                    active={false}
                    onClick={() => {
                      clearWorkbenchFilters();
                      setFilterOpen(false);
                    }}
                  />
                </>
              ) : null}
            </WorkbenchFilterPopover>
          ) : (
            <WorkbenchFilterPopover
              open={filterOpen}
              onOpenChange={setFilterOpen}
              hot={filterHot}
              label={dockedTab === 'triage' ? 'Carton source / search field' : 'Search field'}
              density="field"
            >
              {dockedTab === 'triage' ? (
                <>
                  <WorkbenchFilterGroupLabel>Carton source</WorkbenchFilterGroupLabel>
                  {SCOPE_ITEMS.map(({ id, label, icon: Icon }) => (
                    <WorkbenchFilterMenuRow
                      key={id}
                      label={label}
                      active={searchScope === id}
                      leading={<Icon className="h-3.5 w-3.5 shrink-0" />}
                      onClick={() => {
                        replaceParams(
                          setReceivingHistoryUrlParams(searchParams, {
                            scope: id,
                          }),
                        );
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
                    replaceParams(
                      setReceivingHistoryUrlParams(searchParams, { field: field.id }),
                    );
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
                      clearWorkbenchFilters();
                      setFilterOpen(false);
                    }}
                  />
                </>
              ) : null}
            </WorkbenchFilterPopover>
  );

  return (
    <>
      {/*
        Inbound chrome (Pipeline Band 1 is CTAs only · Docked URL keeps Arrival|Unbox):
          Band 1 — Check / Import / Add · or Docked Arrival | Unbox
          Band 3 — triage find · Views · inspector
      */}
      <WorkbenchChromeHeader
        density="band"
        className={className}
        tabs={isPipeline ? undefined : dockedSubTabs}
        activeTab={isPipeline ? undefined : dockedTab}
        onTabChange={isPipeline ? undefined : setDockedTab}
        solidTone="accent"
        trailing={
          isPipeline ? (
            <WorkbenchTrailingCluster
              actions={
                <IncomingChromeActions
                  onCheckZoho={() => setDeskRail({ kind: 'check' })}
                  onImportZoho={() => {
                    void sync.refreshZoho();
                  }}
                  onImportEbay={() => {
                    void sync.refreshMarketplace();
                  }}
                  onImportCsv={() =>
                    setDeskRail({ kind: 'add', platform: 'amazon', leaf: 'import-returns' })
                  }
                  onAdd={() => {
                    setDeskRail({ kind: 'add', platform: 'amazon', leaf: 'index' });
                  }}
                  importingZoho={sync.zohoRefreshing}
                  importingEbay={sync.marketplaceRefreshing}
                  canCheckZoho
                  canImportZoho
                  canImportEbay={universalIncoming && canImportEbay}
                  canImportCsv
                  canAdd
                />
              }
            />
          ) : undefined
        }
      />

      {/* Band 3 — find + Views ▾ (POS) + view toggles. */}
      <WorkbenchTriageBand
        views={
          isPipeline ? (
            <WorkbenchViewsMenu
              storageKey={SAVED_VIEW_STORAGE_KEY.receiving_incoming}
              paramKeys={SAVED_VIEW_PARAM_KEYS.receiving_incoming}
              emptyHint="No saved views yet — filter Incoming (source, delivery, PO date), then save it here."
            />
          ) : null
        }
        trailing={
          <WorkbenchInspectorToggle
            open={incomingDetailOpen}
            testId="incoming-inspector-toggle"
          />
        }
        search={
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <TechRailSearchBar
              variant="chrome"
              value={urlQRaw}
              onChange={setWorkbenchSearch}
              placeholder={
                isPipeline
                  ? 'Filter purchase order #, tracking, SKU…'
                  : getReceivingHistoryPlaceholder(searchField).replace(/^Search/, 'Filter')
              }
              // ONE in-field control. Pipeline used to seat Source, Kind and
              // Filters here as three separate `density="field"` popovers, each
              // painting the same funnel glyph — three identical marks, none of
              // them saying which was which. Source and Kind are now the first
              // two groups inside the one funnel.
              trailingSuffix={incomingInFieldFilter}
              trailingAction={
                isPipeline ? (
                  <HoverTooltip label="Paste a list of tracking numbers" asChild>
                    <ToolbarButton
                      iconOnly
                      aria-label="Paste a list of tracking numbers"
                      onClick={() => setDeskRail({ kind: 'filter' })}
                      className="h-7 w-7"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </ToolbarButton>
                  </HoverTooltip>
                ) : undefined
              }
              className="min-w-0 flex-1"
            />
            {isPipeline ? (
              <>
                <IncomingSourceHotChip
                  source={activeSource}
                  onClear={() => setSource('all')}
                />
                <IncomingKindHotChip kind={activeKind} onClear={() => setKind('all')} />
              </>
            ) : null}
          </div>
        }
        right={
          <>
            {isPipeline ? (
              <>
                <PaneHeaderPagination
                  page={safePage}
                  pageSize={INCOMING_PAGE_SIZE}
                  total={total}
                  onPrev={() => setPage(safePage - 1)}
                  onNext={() => setPage(safePage + 1)}
                  iconOnly
                />
                <QueueSortSwitch<IncomingSort>
                  sort={filters.sort}
                  onChange={filters.setSort}
                  options={INCOMING_SORT_OPTIONS}
                  ariaLabel="Sort incoming POs"
                  variant="icon"
                />
              </>
            ) : null}
          </>
        }
      />

      {isPipeline ? (
        <>
          <IncomingDeskRightRail tool={deskRail} onClose={closeDeskRail} />

          <IncomingSyncDialog
            open={sync.incSyncOpen}
            kind={sync.incSyncKind}
            isRunning={sync.incSyncRunning}
            elapsedMs={sync.incSyncElapsedMs}
            result={sync.incSyncResult}
            onClose={() => sync.setIncSyncOpen(false)}
          />
        </>
      ) : null}
    </>
  );
}
