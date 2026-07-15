'use client';

/**
 * Shipping workspace attention strip — Monitor KPIs for Pending / FBA / History
 * on `/test` Shipping mode. Same tile anatomy as OutboundKpiStrip.
 */

import { useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import { qk } from '@/queries/keys';
import { KpiTile, metricIntentTextClass, MONITOR_KPI_TILE_CLASS } from '@/design-system/components/monitor';
import {
  resolveShippingMetrics,
  splitShippingAttention,
  ZERO_SHIPPING_FBA,
  ZERO_SHIPPING_HISTORY,
  type ComputedMetric,
  type ShippingFbaCounts,
  type ShippingHistoryCounts,
} from '@/lib/tech/shipping-metrics';
import type { ShippingWorkspaceTab } from '@/utils/shipping-workspace-state';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { CheckCircle, RefreshCw } from '@/components/Icons';
import { useTechLogs, type TechRecord } from '@/hooks/useTechLogs';
import { STAFF_FILTER_PARAM, useStaffFilter } from '@/hooks/useStaffFilter';
import { computeWeekRange, toPSTDateKey } from '@/utils/date';
import { cn } from '@/utils/_cn';

const TILE_BAND_CLASS = 'flex flex-wrap gap-3';
const TILE_CELL_CLASS = 'min-w-0 grow basis-40';
const EMPTY_UNSHIPPED = { total: 0, pending: 0, tested: 0, blocked: 0 };

function MetricKpiTile({ metric }: { metric: ComputedMetric }) {
  const tone = metricIntentTextClass(metric.intent);
  const toneHero = metric.intent === 'warn' || metric.intent === 'bad';
  const footer: ReactNode = metric.status ? (
    <span
      className={cn(
        'mt-1.5 inline-flex items-center gap-1.5 text-role-eyebrow font-semibold uppercase tracking-widest',
        tone,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full bg-current', tone)} aria-hidden="true" />
      {metric.status}
    </span>
  ) : undefined;

  const tile = (
    <KpiTile
      label={metric.label}
      value={metric.value}
      valueClassName={toneHero ? tone : undefined}
      footer={footer}
      className="h-full"
    />
  );

  if (!metric.tooltip) return tile;
  return (
    <HoverTooltip label={metric.tooltip} focusable className="block h-full">
      {tile}
    </HoverTooltip>
  );
}

function SkeletonKpiTile() {
  return (
    <div className={cn(MONITOR_KPI_TILE_CLASS, 'h-full')}>
      <div className="h-2.5 w-16 rounded-full bg-surface-strong" />
      <div className="mt-2 h-7 w-14 rounded bg-surface-strong" />
      <div className="mt-2.5 h-2.5 w-20 rounded-full bg-surface-strong" />
    </div>
  );
}

function StripSkeleton({ reservedSlots }: { reservedSlots: number }) {
  return (
    <div className={cn(TILE_BAND_CLASS, 'animate-pulse')} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading shipping attention metrics…</span>
      {Array.from({ length: reservedSlots }).map((_, i) => (
        <div key={i} className={TILE_CELL_CLASS}>
          <SkeletonKpiTile />
        </div>
      ))}
    </div>
  );
}

function StripAllClear({ mode }: { mode: ShippingWorkspaceTab }) {
  const copy =
    mode === 'pending'
      ? { title: 'The queue is clear.', hint: 'Blocked units and the test backlog surface here.' }
      : mode === 'fba'
        ? { title: 'Nothing needs attention.', hint: 'Labeled, packed, and out-of-stock FBA items surface here.' }
        : { title: 'No scan-outs in view.', hint: 'Today and week throughput surface here.' };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-border-soft bg-surface-card px-4 py-5">
      <CheckCircle className="h-5 w-5 shrink-0 text-text-success" />
      <div className="min-w-0">
        <p className="text-role-caption font-bold text-text-default">{copy.title}</p>
        <p className="mt-0.5 text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
          {copy.hint}
        </p>
      </div>
    </div>
  );
}

function StripError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-8 text-center">
      <p className="text-role-caption font-bold text-rose-700">Couldn&apos;t load shipping metrics.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 inline-flex items-center gap-1 rounded-md border border-rose-200 bg-surface-card px-2.5 py-1 text-role-eyebrow uppercase tracking-widest text-rose-700 hover:bg-rose-100"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Try again
      </button>
    </div>
  );
}

function useFbaStageCounts(): {
  fba: ShippingFbaCounts;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const query = useQuery({
    queryKey: qk.fba.stageCounts,
    queryFn: async () => {
      const res = await fetch('/api/fba/stage-counts', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load FBA stage counts');
      const data = await res.json();
      const c = (data?.counts ?? {}) as Record<string, number>;
      return {
        planned: Number(c.PLANNED) || 0,
        tested: Number(c.TESTED) || 0,
        packed: Number(c.PACKED) || 0,
        outOfStock: Number(c.OUT_OF_STOCK) || 0,
        labeled: Number(c.LABEL_ASSIGNED) || 0,
      } satisfies ShippingFbaCounts;
    },
    staleTime: 60_000,
  });
  return {
    fba: query.data ?? ZERO_SHIPPING_FBA,
    isPending: query.isPending,
    isError: query.isError,
    refetch: () => {
      void query.refetch();
    },
  };
}

function summarizeHistory(records: TechRecord[]): ShippingHistoryCounts {
  const todayKey = toPSTDateKey(new Date());
  let todayTotal = 0;
  let awaitingShip = 0;
  for (const r of records) {
    try {
      if (toPSTDateKey(r.created_at) === todayKey) todayTotal += 1;
    } catch {
      /* ignore bad dates */
    }
    if (!r.is_shipped) awaitingShip += 1;
  }
  return {
    weekTotal: records.length,
    todayTotal,
    awaitingShip,
  };
}

function StripLayout({
  mode,
  metrics,
  isPending,
  isError,
  reservedSlots,
  onRetry,
}: {
  mode: ShippingWorkspaceTab;
  metrics: ComputedMetric[];
  isPending: boolean;
  isError: boolean;
  reservedSlots: number;
  onRetry: () => void;
}) {
  if (isError) return <StripError onRetry={onRetry} />;
  if (isPending) return <StripSkeleton reservedSlots={reservedSlots} />;
  const { attention, rest } = splitShippingAttention(metrics);
  const tiles = [...attention, ...rest];
  if (tiles.length === 0) return <StripAllClear mode={mode} />;
  return (
    <div className={TILE_BAND_CLASS}>
      {tiles.map((metric) => (
        <div key={metric.id} className={TILE_CELL_CLASS}>
          <MetricKpiTile metric={metric} />
        </div>
      ))}
    </div>
  );
}

function PendingStrip() {
  const query = useQuery(unshippedQueueCountsQuery());
  const data = query.data;
  const unshipped = {
    total: data?.total ?? 0,
    pending: data?.byStage.pending ?? 0,
    tested: data?.byStage.tested ?? 0,
    blocked: (data?.combos ?? []).reduce((s, c) => s + (c.blocked ? c.count : 0), 0),
  };
  const metrics = resolveShippingMetrics({
    mode: 'pending',
    unshipped,
    fba: ZERO_SHIPPING_FBA,
    history: ZERO_SHIPPING_HISTORY,
  });
  return (
    <StripLayout
      mode="pending"
      metrics={metrics}
      isPending={query.isPending}
      isError={query.isError}
      reservedSlots={2}
      onRetry={() => {
        void query.refetch();
      }}
    />
  );
}

function FbaStrip() {
  const { fba, isPending, isError, refetch } = useFbaStageCounts();
  const metrics = resolveShippingMetrics({
    mode: 'fba',
    unshipped: EMPTY_UNSHIPPED,
    fba,
    history: ZERO_SHIPPING_HISTORY,
  });
  return (
    <StripLayout
      mode="fba"
      metrics={metrics}
      isPending={isPending}
      isError={isError}
      reservedSlots={2}
      onRetry={refetch}
    />
  );
}

function HistoryStrip({ techId }: { techId?: number }) {
  const { staffId } = useStaffFilter({ allToken: 'all' });
  const searchParams = useSearchParams();
  const wantAll = String(searchParams.get(STAFF_FILTER_PARAM) || '').toLowerCase() === 'all';
  const weekRange = useMemo(() => computeWeekRange(0), []);
  const ownId = techId != null && techId > 0 ? techId : null;
  const techScope = wantAll ? 'all' : (staffId ?? ownId ?? 'all');
  const query = useTechLogs(techScope, { weekOffset: 0, weekRange });
  const history = useMemo(
    () => summarizeHistory(Array.isArray(query.data) ? query.data : []),
    [query.data],
  );
  const metrics = resolveShippingMetrics({
    mode: 'history',
    unshipped: EMPTY_UNSHIPPED,
    fba: ZERO_SHIPPING_FBA,
    history,
  });
  return (
    <StripLayout
      mode="history"
      metrics={metrics}
      isPending={query.isPending}
      isError={query.isError}
      reservedSlots={2}
      onRetry={() => {
        void query.refetch();
      }}
    />
  );
}

export function ShippingKpiStrip({
  mode,
  techId,
}: {
  mode: ShippingWorkspaceTab;
  /** Signed-in tech — History strip defaults to this staff when `?staff=` is absent. */
  techId?: number;
}) {
  return (
    <section aria-label="Shipping attention" className="shrink-0">
      {mode === 'pending' ? (
        <PendingStrip />
      ) : mode === 'fba' ? (
        <FbaStrip />
      ) : (
        <HistoryStrip techId={techId} />
      )}
    </section>
  );
}
