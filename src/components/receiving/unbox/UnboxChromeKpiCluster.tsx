'use client';

/**
 * Unbox's KPI row — its own pinned chrome row between the tabs/CTA row and
 * the data-table triage band, not squeezed into either. Big `KpiTile` cards
 * (not a compact inline readout — the previous shape here), because these
 * are the most important read on the bench and doubled as clickable filters:
 * clicking a tile narrows the table to the rows behind that number, via the
 * SAME row predicate `unbox-metrics.ts` used to compute the number
 * (`unboxKpiRowFilter`) — the count and the filter can never disagree.
 *
 * `queue-depth` (a count) and `oldest-wait` (a duration) have no row
 * membership test, so they render as plain informational tiles.
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  KpiTile,
  metricIntentTextClass,
  MONITOR_KPI_TILE_CLASS,
  OpsKpiBand,
  OpsKpiBandCell,
  OpsKpiBandEmpty,
  OpsKpiBandError,
} from '@/design-system/components/monitor';
import { cn } from '@/utils/_cn';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useReceivingModeContext } from '@/components/station/useReceivingModeContext';
import { useReceivingLinesQuery } from '@/components/station/useReceivingLinesQuery';
import {
  isUnboxKpiFilterable,
  queueCounts,
  recentCounts,
  resolveUnboxMetrics,
  splitUnboxAttention,
  viewedCounts,
  UNBOX_KPI_FILTER_PARAM,
  ZERO_UNBOX_QUEUE,
  ZERO_UNBOX_RECENT,
  ZERO_UNBOX_VIEWED,
  type ComputedMetric,
} from '@/lib/receiving/unbox-metrics';
import type { UnboxWorkspaceTab } from '@/utils/unbox-workspace-state';
import { useSurfacePaintMark } from '@/lib/observability/paint-timing';

function MetricKpiTile({
  metric,
  active,
  onOpen,
}: {
  metric: ComputedMetric;
  active: boolean;
  onOpen?: () => void;
}) {
  const tone = metricIntentTextClass(metric.intent);
  const tile = (
    <KpiTile
      label={metric.label}
      value={metric.value}
      valueClassName={metric.intent === 'warn' || metric.intent === 'bad' ? tone : undefined}
      className="h-full"
      active={active}
      onOpen={onOpen}
    />
  );
  return metric.tooltip ? (
    <HoverTooltip label={metric.tooltip} focusable className="block h-full">
      {tile}
    </HoverTooltip>
  ) : (
    tile
  );
}

/**
 * Local — `OpsKpiBand`'s own skeleton was pruned once this row's predecessor
 * (`UnboxKpiStrip`, deleted earlier this session) was its last consumer. This
 * is the one place that still needs the big-card loading shape, so it stays
 * local rather than reviving a shared export nothing else uses.
 */
function KpiRowSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-wrap gap-3 animate-pulse" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading unbox metrics…</span>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className={cn(MONITOR_KPI_TILE_CLASS, 'min-w-0 grow basis-40 h-20')}>
          <div className="flex items-start justify-between gap-3">
            <div className="h-2.5 w-16 rounded-full bg-surface-strong" />
            <div className="h-2.5 w-8 rounded-full bg-surface-strong" />
          </div>
          <div className="mt-2 h-7 w-14 rounded bg-surface-strong" />
        </div>
      ))}
    </div>
  );
}

function emptyCopy(mode: UnboxWorkspaceTab): string {
  if (mode === 'queue') return 'No door-scanned cartons are waiting to unbox.';
  if (mode === 'recent') return 'You have not opened any lines yet.';
  return 'No cartons have been opened on Unbox yet.';
}

export function UnboxChromeKpiCluster({ mode }: { mode: UnboxWorkspaceTab }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeFilter = searchParams.get(UNBOX_KPI_FILTER_PARAM);

  // Same shared spine-first query the table resolves — zero extra fetches.
  const { mode: tableMode, modeContext } = useReceivingModeContext();
  const { data, isLoading, isError, refetch } = useReceivingLinesQuery({
    mode: tableMode,
    modeContext,
  });

  const rows = useMemo(
    () => (Array.isArray(data?.receiving_lines) ? data.receiving_lines : []),
    [data],
  );

  const queue = useMemo(
    () => (mode === 'queue' ? queueCounts(rows, Number(data?.total)) : ZERO_UNBOX_QUEUE),
    [mode, rows, data?.total],
  );

  const metrics = resolveUnboxMetrics({
    mode,
    recent: mode === 'history' ? recentCounts(rows) : ZERO_UNBOX_RECENT,
    queue,
    viewed: mode === 'recent' ? viewedCounts(rows) : ZERO_UNBOX_VIEWED,
  });
  const { attention, rest } = splitUnboxAttention(metrics);
  const tiles = [...attention, ...rest];

  useSurfacePaintMark('unbox:kpi', !isLoading);

  // Switching tabs invalidates a filter minted for the previous tab's
  // vocabulary (`priority` means nothing on History) — never carry it across.
  const toggleFilter = useCallback(
    (metricId: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (activeFilter === metricId) next.delete(UNBOX_KPI_FILTER_PARAM);
      else next.set(UNBOX_KPI_FILTER_PARAM, metricId);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [activeFilter, pathname, router, searchParams],
  );

  if (isError) {
    return <OpsKpiBandError message="Couldn't load unbox metrics." onRetry={refetch} />;
  }
  if (isLoading) {
    return <KpiRowSkeleton count={3} />;
  }
  if (tiles.length === 0) {
    return <OpsKpiBandEmpty description={emptyCopy(mode)} />;
  }

  return (
    <OpsKpiBand aria-label="Unbox attention">
      {tiles.map((metric) => {
        const filterable = isUnboxKpiFilterable(metric.id, mode);
        return (
          <OpsKpiBandCell key={metric.id}>
            <MetricKpiTile
              metric={metric}
              active={filterable && activeFilter === metric.id}
              onOpen={filterable ? () => toggleFilter(metric.id) : undefined}
            />
          </OpsKpiBandCell>
        );
      })}
    </OpsKpiBand>
  );
}
