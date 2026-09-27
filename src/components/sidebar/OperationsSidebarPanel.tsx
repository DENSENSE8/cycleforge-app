'use client';

/** Operations master-page sidebar — the single contextual panel for `/operations`. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/utils/_cn';
import { SidebarShell } from '@/components/layout/SidebarShell';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { SearchBar } from '@/components/ui/SearchBar';
import { SidebarNavOverlaySlider } from '@/components/sidebar/SidebarNavOverlaySlider';
import { HorizontalButtonSlider } from '@/components/ui/HorizontalButtonSlider';
import { sectionLabel } from '@/design-system/tokens/typography/presets';
import { useQuery } from '@tanstack/react-query';
import { OPERATIONS_QUERY_KEY } from '@/features/operations/components/operations-dashboard-logic';
import type { DashboardData } from '@/features/operations/types';
import {
  JOURNEY_DIMENSION_ITEMS,
} from '@/components/sidebar/operations/operations-sidebar-shared';
import { useOperationsMode } from '@/components/sidebar/operations/useOperationsMode';
import { useOperationsTimelineUrlState } from '@/components/sidebar/operations/useOperationsTimelineUrlState';
import { isOperationsHistoryBrowseEnabled } from '@/lib/operations/operations-history-flags';
import { HistoryBrowseFilters } from '@/components/sidebar/operations/HistoryBrowseFilters';
import type { JourneyDimension } from '@/lib/timeline/journey';
import {
  parseSignalsView,
  replaceOperationsSignalsUrl,
  SIGNALS_VIEW_ITEMS,
  type SignalsView,
} from '@/features/signals/signals-url';
import { SIGNAL_KIND_LIST, SIGNAL_KINDS } from '@/lib/surfaces/registry';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';
// Ex-admin console rails, re-homed with their modes (admin dissolution).
import { GoalsSidebarPanel } from '@/components/sidebar/GoalsSidebarPanel';
import { StaffScheduleSidebarPanel } from '@/components/admin/StaffScheduleSidebarPanel';
import { LogsSidebarPanel } from '@/components/admin/LogsSidebarPanel';


/* `ANALYTICS_RANGES` / `ANALYTICS_SECTIONS` and `AnalyticsSidebar` were deleted 2026-09-16 with the mode they steered. */

export function OperationsSidebarPanel() {
  const { mode } = useOperationsMode();

  if (mode === 'history') return <HistorySidebar />;
  if (mode === 'signals') return <SignalsSidebar />;
  if (mode === 'reconciliation') return <ReconciliationSidebar />;
  if (mode === 'checks') return <ChecksSidebar />;
  // Absorbed from /admin (dissolution): each mode keeps the rail its console
  // section carried, so the filters the body reads still have their writer.
  if (mode === 'goals') return <GoalsSidebarPanel />;
  if (mode === 'staff') return <StaffScheduleSidebarPanel />;
  if (mode === 'logs') return <LogsSidebarPanel />;
  // `plans` is no longer an Operations mode — forge/plans moved to Home and the
  // right pane redirects `?mode=plans` there (HOME-OPS §3.2). No plan-edit chrome
  // renders in Operations; a stale `?mode=plans` bookmark falls through to Live.
  return <LiveSidebar />;
}

// ── Live ────────────────────────────────────────────────────────────────────

function LiveSidebar() {
  const [q, setQ] = useState('');
  // Read-only view of the shared dashboard cache.
  const { data } = useQuery<DashboardData>({
    queryKey: OPERATIONS_QUERY_KEY,
    queryFn: () => Promise.reject(new Error('operations dashboard cache is produced by the right pane')),
    enabled: false,
    staleTime: Infinity,
  });
  const isLoading = !data;

  /* The rail's four tiles, renamed to what their queries COUNT and carrying the window in words (2026-09-16). */
  const kpis = useMemo(
    () =>
      [
        { key: 'all', label: 'Scans today', tone: 'text-blue-600', meta: 'All stations · PST' },
        { key: 'tested', label: 'Tested today', tone: 'text-emerald-600', meta: 'Tech bench · PST' },
        { key: 'fba', label: 'FBA scans today', tone: 'text-violet-600', meta: 'FNSKU events · PST' },
        { key: 'repair', label: 'Repair queue', tone: 'text-orange-600', meta: 'Open now' },
      ] as const,
    [],
  );

  const feed = useMemo(() => {
    const rows = data?.activityFeed ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.summary?.toLowerCase().includes(needle) ||
        r.type?.toLowerCase().includes(needle) ||
        r.actor_name?.toLowerCase().includes(needle),
    );
  }, [data?.activityFeed, q]);

  return (
    <SidebarShell
      headerAbove={
        /* In-context list filter — local base SearchBar; the global header
            pill stays global (search any order across the app). */
        <div className={`${SIDEBAR_GUTTER} pt-3 pb-2`}>
          <SearchBar
            size="compact"
            variant="blue"
            value={q}
            onChange={setQ}
            onClear={() => setQ('')}
            placeholder="Filter live activity…"
          />
        </div>
      }
      bodyClassName="pt-0 pb-6"
    >
      <div className={cn('space-y-4 pt-4')}>
        <div className="grid grid-cols-2 gap-2">
          {kpis.map((k) => {
            const cell = data?.summary?.[k.key];
            return (
              <div key={k.key} className="rounded-none border border-border-soft bg-surface-card p-2.5">
                <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">{k.label}</p>
                <p className={cn('mt-0.5 text-xl font-semibold tabular-nums leading-none', k.tone)}>
                  {cell ? cell.value.toLocaleString() : isLoading ? '·' : '0'}
                </p>
                <p className="mt-1 text-role-micro leading-tight text-text-soft">{k.meta}</p>
              </div>
            );
          })}
        </div>

        <div>
          <p className={cn(sectionLabel, 'mb-2')}>Live feed</p>
          <ul className="divide-y divide-border-hairline">
            {feed.slice(0, 24).map((r) => (
              <li key={r.id} className="flex items-start gap-2 py-1.5">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-400" aria-hidden />
                <div className="min-w-0">
                  <p className="truncate text-role-caption font-semibold text-text-default">{r.summary || r.type}</p>
                  <p className="truncate text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
                    {r.source} · {r.actor_name ?? 'system'}
                  </p>
                </div>
              </li>
            ))}
            {feed.length === 0 &&
              (isLoading ? (
                <li>
                  <UniversalLoader isLoading label="Loading live activity" className="min-h-24" />
                </li>
              ) : (
                <li className="py-6 text-center text-role-caption text-text-faint">
                  No matching activity.
                </li>
              ))}
          </ul>
        </div>
      </div>
    </SidebarShell>
  );
}

// ── Signals ───────────────────────────────────────────────────────────────────

const SIGNALS_WINDOWS: Array<{ id: string; label: string; days: number | null }> = [
  { id: '7d', label: '7 days', days: 7 },
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
  { id: 'all', label: 'All time', days: null },
];

const SIGNALS_FILTER_SELECT_CLASS =
  cn('w-full rounded-none border border-border-soft bg-surface-card px-2 py-1.5 text-role-caption font-semibold text-text-muted', focusRing('field', 'accent'));

function SignalsSidebar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const signalsView = parseSignalsView(searchParams.get('signalsView'));
  const windowId = searchParams.get('window') ?? '30d';
  const kind = searchParams.get('signalKind') ?? '';

  const setSignalsView = (next: SignalsView) => {
    replaceOperationsSignalsUrl(router, searchParams, (sp) => {
      if (next === 'browse') sp.set('signalsView', 'browse');
      else sp.delete('signalsView');
      sp.delete('signalId');
      sp.delete('window');
      sp.delete('signalKind');
      sp.delete('q');
    });
  };

  const setParam = useCallback(
    (key: string, value: string) => {
      replaceOperationsSignalsUrl(router, searchParams, (sp) => {
        if (value) sp.set(key, value);
        else sp.delete(key);
      });
    },
    [router, searchParams],
  );

  return (
    <SidebarShell
      headerRows={[
        <HorizontalButtonSlider
          key="signals-view"
          items={SIGNALS_VIEW_ITEMS}
          value={signalsView}
          onChange={(id) => setSignalsView(id as SignalsView)}
          variant="nav"
          dense
          className="w-full"
          aria-label="Signals view"
        />,
      ]}
      bodyClassName="pt-0 pb-6"
    >
      <div className={cn('space-y-4 pt-3')}>
        {signalsView === 'timeline' ? (
          <>
            <p className="text-role-caption leading-5 text-text-muted">
              Org-scoped timeline — returns, test fails, receiving exceptions, denials, buyer notes.
            </p>
            <div className="space-y-2">
              <label className="block space-y-1">
                <span className={cn(sectionLabel)}>Time window</span>
                <select
                  className={SIGNALS_FILTER_SELECT_CLASS}
                  value={windowId}
                  onChange={(e) => setParam('window', e.target.value === '30d' ? '' : e.target.value)}
                  aria-label="Time window"
                >
                  {SIGNALS_WINDOWS.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className={cn(sectionLabel)}>Signal kind</span>
                <select
                  className={SIGNALS_FILTER_SELECT_CLASS}
                  value={kind}
                  onChange={(e) => setParam('signalKind', e.target.value)}
                  aria-label="Signal kind"
                >
                  <option value="">All kinds</option>
                  {SIGNAL_KIND_LIST.map((k) => (
                    <option key={k} value={k}>
                      {SIGNAL_KINDS[k].label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            {/* In-context filter — local base SearchBar over signal notes (?q=);
                the global header pill stays global (search any order app-wide). */}
            <SearchBar
              size="compact"
              variant="blue"
              value={searchParams.get('q') ?? ''}
              onChange={(v) => setParam('q', v)}
              onClear={() => setParam('q', '')}
              placeholder="Filter signal notes…"
            />
            <p className="text-role-caption leading-5 text-text-muted">
              Select a signal from the list to inspect its detail.
            </p>
          </div>
        )}
      </div>
    </SidebarShell>
  );
}

// ── History ───────────────────────────────────────────────────────────────────

function HistorySidebar() {
  const url = useOperationsTimelineUrlState();
  // Browse-feed filters show when the browse region is on-screen (not focused
  // on a record). The URL setters they drive already exist.
  const showFilters = isOperationsHistoryBrowseEnabled() && !url.focused;
  // Draft text until Enter — avoid a journey fetch on every keystroke.
  const [draft, setDraft] = useState(url.entityValue);
  useEffect(() => {
    setDraft(url.entityValue);
  }, [url.entityValue]);

  // Local paste-a-number field — focuses a record's journey timeline. Cross-entity
  // search lives in the global header → Dashboard Search, not here.
  return (
    <SidebarShell
      headerAbove={
        <div className={`${SIDEBAR_GUTTER} pt-3 pb-2`}>
          <SearchBar
            size="compact"
            variant="blue"
            value={draft}
            onChange={setDraft}
            onClear={() => {
              setDraft('');
              url.setEntity('');
            }}
            onSearch={(v) => {
              const t = v.trim();
              if (t) url.setEntity(t);
            }}
            placeholder="Paste order, serial, or tracking…"
            debounceMs={300}
          />
        </div>
      }
      bodyClassName="pt-0"
    >
      <SidebarNavOverlaySlider
        items={JOURNEY_DIMENSION_ITEMS}
        value={url.dim}
        onChange={(id) => url.setDim(id as JourneyDimension)}
        aria-label="Journey dimension"
      />
      {showFilters ? <HistoryBrowseFilters url={url} /> : null}
    </SidebarShell>
  );
}

// ── Reconciliation ────────────────────────────────────────────────────────────

function ReconciliationSidebar() {
  return (
    <SidebarShell bodyClassName="pt-0 pb-6">
      <div className={cn('space-y-3 pt-3', SIDEBAR_GUTTER)}>
        <p className={cn(sectionLabel)}>Reconcile</p>
        <p className="text-role-caption leading-5 text-text-muted">
          Serial↔order binding risks and unmatched tracking holds. The right pane lists smear
          candidates (unbound tech serials on multi-order cartons) and open{' '}
          <span className="font-semibold text-text-soft">orders_exceptions</span>.
        </p>
      </div>
    </SidebarShell>
  );
}

function ChecksSidebar() {
  return (
    <SidebarShell bodyClassName="pt-0 pb-6">
      <div className={cn('space-y-3 pt-3', SIDEBAR_GUTTER)}>
        <p className={cn(sectionLabel)}>Checks</p>
        <p className="text-role-caption leading-5 text-text-muted">
          Who still owes today&apos;s daily list. The roster is a live read of the same marks
          operators tick on Home — not a stored report. Open a row on Home to inspect ticket
          connections.
        </p>
      </div>
    </SidebarShell>
  );
}

// ── Shared bits ───────────────────────────────────────────────────────────────
