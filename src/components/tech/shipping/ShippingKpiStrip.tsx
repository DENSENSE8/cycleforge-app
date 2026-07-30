'use client';

/**
 * Shipping workspace attention strip — Monitor KPIs for Pending / History
 * on `/test` Shipping mode. Same tile anatomy as OutboundKpiStrip.
 *
 * Pending tiles that map to a fulfillment lane click-to-toggle `?ustatus` via
 * {@link useToShipStatusFilter} — the same param the toolbar exact filters use —
 * so the board under the strip collapses to that lane.
 */

import { useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import { KpiTile, metricIntentTextClass, MONITOR_KPI_TILE_CLASS } from '@/design-system/components/monitor';
import {
  resolveShippingMetrics,
  splitShippingAttention,
  ZERO_SHIPPING_HISTORY,
  type ComputedMetric,
  type ShippingHistoryCounts,
} from '@/lib/tech/shipping-metrics';
import type { ShippingWorkspaceTab } from '@/utils/shipping-workspace-state';
import { useToShipStatusFilter } from '@/components/unshipped/useToShipStatusFilter';
import { useGatedOperationsRoi } from '@/features/operations/workspace/useGatedOperationsRoi';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { CheckCircle, RefreshCw } from '@/components/Icons';
import { useTechLogs, type TechRecord } from '@/hooks/useTechLogs';
import { STAFF_FILTER_PARAM, useStaffFilter } from '@/hooks/useStaffFilter';
import { computeWeekRange, toPSTDateKey } from '@/utils/date';
import type { FulfillmentState } from '@/lib/unshipped-state';
import { cn } from '@/utils/_cn';

const TILE_BAND_CLASS = 'flex flex-wrap gap-3';
const TILE_CELL_CLASS = 'min-w-0 grow basis-40';
const EMPTY_UNSHIPPED = { total: 0, pending: 0, tested: 0, blocked: 0 };

type ToShipFilter = { active: FulfillmentState | null; toggle: (state: FulfillmentState) => void };

function MetricKpiTile({ metric, toShipFilter }: { metric: ComputedMetric; toShipFilter?: ToShipFilter }) {
  const tone = metricIntentTextClass(metric.intent);
  const toneHero = metric.intent === 'warn' || metric.intent === 'bad';
  const clickable = Boolean(metric.filterUstatus && toShipFilter);
  const active = Boolean(metric.filterUstatus && toShipFilter?.active === metric.filterUstatus);
  // DeltaChip wins when present (Packed WoW); otherwise status footer.
  const footer: ReactNode =
    metric.delta !== undefined
      ? undefined
      : metric.status
        ? (
            <span
              className={cn(
                'mt-1.5 inline-flex items-center gap-1.5 text-role-eyebrow font-semibold uppercase tracking-widest',
                tone,
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full bg-current', tone)} aria-hidden="true" />
              {active ? 'Filtered' : metric.status}
            </span>
          )
        : undefined;

  const tile = (
    <KpiTile
      label={metric.label}
      value={metric.value}
      valueClassName={toneHero ? tone : undefined}
      delta={metric.delta}
      invertDelta={metric.deltaInvert}
      deltaVsLabel="vs last wk"
      footer={footer}
      active={active}
      onOpen={
        clickable ? () => toShipFilter?.toggle(metric.filterUstatus as FulfillmentState) : undefined
      }
      className="h-full"
    />
  );

  if (!metric.tooltip) return tile;
  return (
    <HoverTooltip label={metric.tooltip} focusable={!clickable} className="block h-full">
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
      ? { title: 'The queue is clear.', hint: 'Blocked units, backlog, and week throughput surface here.' }
      : { title: 'No scan-outs in view.', hint: 'Today and week throughput surface here.' };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-border-soft bg-surface-card px-4 py-5">
      <CheckCircle className="h-5 w-5 shrink-0 text-text-success" />
      <div className="min-w-0">
        <p className="text-role-caption font-semibold text-text-default">{copy.title}</p>
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
      <p className="text-role-caption font-semibold text-rose-700">Couldn&apos;t load shipping metrics.</p>
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
  toShipFilter,
}: {
  mode: ShippingWorkspaceTab;
  metrics: ComputedMetric[];
  isPending: boolean;
  isError: boolean;
  reservedSlots: number;
  onRetry: () => void;
  toShipFilter?: ToShipFilter;
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
          <MetricKpiTile metric={metric} toShipFilter={toShipFilter} />
        </div>
      ))}
    </div>
  );
}

function PendingStrip() {
  const query = useQuery(unshippedQueueCountsQuery());
  const { roi, pending: roiPending } = useGatedOperationsRoi();
  const toShipFilter = useToShipStatusFilter();
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
    history: ZERO_SHIPPING_HISTORY,
    roi,
  });
  return (
    <StripLayout
      mode="pending"
      metrics={metrics}
      isPending={query.isPending || roiPending}
      isError={query.isError}
      reservedSlots={4}
      toShipFilter={toShipFilter}
      onRetry={() => {
        void query.refetch();
      }}
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
    history,
    roi: null,
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
      ) : (
        <HistoryStrip techId={techId} />
      )}
    </section>
  );
}
