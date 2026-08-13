'use client';

/**
 * Unbox Band 2 — compact Usage strip: quiet text range · stage/lane · metric
 * cells (micro label · modest value · tiny spark). Spreadsheet stays below;
 * `?ukpi=` still filters the table. No viz mode switch / pie / line chrome.
 */

import { useCallback, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  KpiChartCard,
  OpsKpiBandEmpty,
  OpsKpiBandError,
} from '@/design-system/components/monitor';
import { cn } from '@/utils/_cn';
import type { UnboxWorkspaceTab } from '@/utils/unbox-workspace-state';
import { unboxKpiFeedTab } from '@/utils/unbox-workspace-state';
import {
  UNBOX_KPI_FILTER_PARAM,
  UNBOX_KPI_RANGES,
  parseUnboxKpiRange,
  type UnboxKpiMetricCard,
  type UnboxKpiRange,
} from '@/lib/receiving/unbox-metrics';
import { Panel } from '@/design-system/primitives';


const RANGE_SHORT: Record<UnboxKpiRange, string> = {
  '24h': '24h',
  '7d': '7d',
  '30d': '30d',
  '90d': '90d',
};

const TRIAGE_LANE_OPTS = [
  { value: 'PO_STOCKOUT', label: 'Stockout' },
  { value: 'PO_STANDARD', label: 'Standard' },
  { value: 'RETURN', label: 'Return' },
  { value: 'HOLD', label: 'Hold' },
] as const;

/** Quiet text chip — soft wash when active, no solid pill track / chunky facet. */
function QuietTextOption({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      // ds-raw-button: dense Usage-strip text option (not Button density)
      className={cn(
        'rounded-md px-1.5 py-0.5 text-role-micro font-semibold uppercase tracking-wide transition-colors',
        active
          ? 'bg-surface-sunken text-text-default'
          : 'text-text-faint hover:text-text-soft',
      )}
      onClick={onClick}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function CanvasSkeleton() {
  return (
    <div
      className="flex min-h-[4.5rem] flex-col gap-2 animate-pulse"
      aria-busy="true"
      aria-live="polite"
      data-testid="unbox-kpi-canvas-skeleton"
    >
      <span className="sr-only">Loading unbox metrics…</span>
      <div className="flex items-center gap-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-4 w-8 rounded bg-surface-strong" />
        ))}
      </div>
      <div className="flex min-w-0 flex-wrap gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Panel radius="xl" padding="none" className="min-h-[4rem] min-w-0 grow basis-36 p-2" key={i}>
            <div className="h-2.5 w-14 rounded bg-surface-strong" />
            <div className="mt-1.5 h-5 w-10 rounded bg-surface-strong" />
            <div className="mt-2 h-5 w-full rounded bg-surface-strong" />
          </Panel>
        ))}
      </div>
    </div>
  );
}

export function UnboxKpiCanvas({
  mode,
  metrics,
  isLoading,
  isError,
  onRetry,
}: {
  mode: UnboxWorkspaceTab;
  metrics: UnboxKpiMetricCard[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const range = parseUnboxKpiRange(searchParams.get('urange'));
  const activeFilter = searchParams.get(UNBOX_KPI_FILTER_PARAM);
  const feedMode = unboxKpiFeedTab(mode);
  const ustageRaw = (searchParams.get('ustage') || '').trim().toLowerCase();
  const queueStage: 'staged' | 'unstaged' | null =
    ustageRaw === 'staged' || ustageRaw === 'unstaged' ? ustageRaw : null;
  const ulaneRaw = (searchParams.get('ulane') || '').trim().toUpperCase();
  const queueLane = TRIAGE_LANE_OPTS.some((o) => o.value === ulaneRaw)
    ? (ulaneRaw as (typeof TRIAGE_LANE_OPTS)[number]['value'])
    : null;

  const patchParams = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setRange = (nextRange: UnboxKpiRange) => {
    patchParams((next) => {
      if (nextRange === '7d') next.delete('urange');
      else next.set('urange', nextRange);
    });
  };

  const setStage = (id: 'staged' | 'unstaged' | null) => {
    patchParams((next) => {
      if (id == null) next.delete('ustage');
      else next.set('ustage', id);
    });
  };

  const setLane = (id: string | null) => {
    patchParams((next) => {
      if (id == null) next.delete('ulane');
      else next.set('ulane', id);
    });
  };

  const toggleFilter = (metricId: string) => {
    patchParams((next) => {
      if (activeFilter === metricId) next.delete(UNBOX_KPI_FILTER_PARAM);
      else next.set(UNBOX_KPI_FILTER_PARAM, metricId);
    });
  };

  if (isError) {
    return <OpsKpiBandError message="Couldn't load unbox metrics." onRetry={onRetry} />;
  }
  if (isLoading) {
    return <CanvasSkeleton />;
  }
  if (metrics.length === 0) {
    const copy =
      feedMode === 'queue'
        ? 'No door-scanned cartons are waiting to unbox.'
        : feedMode === 'recent'
          ? 'You have not opened any lines yet.'
          : 'No cartons have been opened on Unbox yet.';
    return <OpsKpiBandEmpty description={copy} />;
  }

  return (
    <div
      className="flex flex-col gap-2"
      data-testid="unbox-kpi-canvas"
      role="region"
      aria-label="Unbox metrics"
    >
      {/* Header row — quiet range + optional queue facets (Usage strip). */}
      <div
        className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1"
        data-testid="unbox-kpi-strip-header"
      >
        <div className="flex items-center gap-0.5" role="group" aria-label="Time range">
          {UNBOX_KPI_RANGES.map((id) => (
            <QuietTextOption
              key={id}
              active={range === id}
              onClick={() => setRange(id)}
            >
              {RANGE_SHORT[id]}
            </QuietTextOption>
          ))}
        </div>
        {feedMode === 'queue' ? (
          <>
            <div
              className="flex items-center gap-0.5"
              role="group"
              aria-label="Stage"
            >
              {(
                [
                  { id: null, label: 'All' },
                  { id: 'staged' as const, label: 'Staged' },
                  { id: 'unstaged' as const, label: 'Unstaged' },
                ] as const
              ).map((opt) => (
                <QuietTextOption
                  key={opt.label}
                  active={queueStage === opt.id}
                  onClick={() => setStage(opt.id)}
                >
                  {opt.label}
                </QuietTextOption>
              ))}
            </div>
            <div
              className="flex items-center gap-0.5"
              role="group"
              aria-label="Lane"
            >
              <QuietTextOption active={queueLane == null} onClick={() => setLane(null)}>
                All lanes
              </QuietTextOption>
              {TRIAGE_LANE_OPTS.map((opt) => (
                <QuietTextOption
                  key={opt.value}
                  active={queueLane === opt.value}
                  onClick={() => setLane(opt.value)}
                >
                  {opt.label}
                </QuietTextOption>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="KPI metrics">
        {metrics.map((metric) => (
          <div key={metric.id} className="min-w-0 grow basis-36 sm:basis-40">
            <KpiChartCard
              density="compact"
              id={metric.id}
              label={metric.label}
              value={metric.value}
              intent={metric.intent}
              tooltip={metric.tooltip}
              series={metric.series}
              breakdown={metric.breakdown}
              filterable={metric.filterable}
              active={metric.filterable && activeFilter === metric.id}
              onOpen={metric.filterable ? () => toggleFilter(metric.id) : undefined}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
