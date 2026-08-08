'use client';

/**
 * Shipping workspace attention strip — Monitor KPIs for Pending / History
 * on `/test` Shipping mode. Same tile anatomy as OutboundKpiStrip.
 *
 * Pending tiles that map to a fulfillment lane click-to-toggle `?ustatus` via
 * {@link useToShipStatusFilter} — the same param the toolbar exact filters use —
 * so the board under the strip collapses to that lane.
 */

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import { KpiTile, metricIntentTextClass, OpsKpiBand, OpsKpiBandCell, OpsKpiBandEmpty, OpsKpiBandError, OpsKpiBandSkeletonTile } from '@/design-system/components/monitor';
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
import { useTechLogs, type TechRecord } from '@/hooks/useTechLogs';
import { STAFF_FILTER_PARAM, useStaffFilter } from '@/hooks/useStaffFilter';
import { computeWeekRange, toPSTDateKey } from '@/utils/date';
import type { FulfillmentState } from '@/lib/unshipped-state';

const EMPTY_UNSHIPPED = { total: 0, pending: 0, tested: 0, blocked: 0 };

type ToShipFilter = { active: FulfillmentState | null; toggle: (state: FulfillmentState) => void };

function MetricKpiTile({ metric, toShipFilter }: { metric: ComputedMetric; toShipFilter?: ToShipFilter }) {
  const tone = metricIntentTextClass(metric.intent);
  const toneHero = metric.intent === 'warn' || metric.intent === 'bad';
  const clickable = Boolean(metric.filterUstatus && toShipFilter);
  const active = Boolean(metric.filterUstatus && toShipFilter?.active === metric.filterUstatus);

  const tile = (
    <KpiTile
      density="band"
      label={metric.label}
      value={metric.value}
      valueClassName={toneHero ? tone : undefined}
      delta={metric.delta}
      invertDelta={metric.deltaInvert}
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

function StripSkeleton({ reservedSlots }: { reservedSlots: number }) {
  return (
    <OpsKpiBand density="band" className="animate-pulse" aria-label="Loading shipping attention metrics">
      <span className="sr-only">Loading shipping attention metrics…</span>
      {Array.from({ length: reservedSlots }).map((_, i) => (
        <OpsKpiBandCell key={i} density="band">
          <OpsKpiBandSkeletonTile density="band" />
        </OpsKpiBandCell>
      ))}
    </OpsKpiBand>
  );
}

function StripAllClear({ mode }: { mode: ShippingWorkspaceTab }) {
  const copy =
    mode === 'pending' || mode === 'urgent' || mode === 'all'
      ? {
          title:
            mode === 'urgent'
              ? 'No urgent orders.'
              : mode === 'all'
                ? 'Nothing to triage.'
                : 'The queue is clear.',
          hint: 'Blocked units, backlog, and week throughput surface here.',
        }
      : { title: 'No scan-outs in view.', hint: 'Today and week throughput surface here.' };
  return <OpsKpiBandEmpty density="band" title={copy.title} description={copy.hint} />;
}

function StripError({ onRetry }: { onRetry: () => void }) {
  return (
    <OpsKpiBandError
      density="band"
      message="Couldn't load shipping metrics."
      onRetry={onRetry}
    />
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
    <OpsKpiBand density="band" aria-label="Ready to Pack attention metrics">
      {tiles.map((metric) => (
        <OpsKpiBandCell key={metric.id} density="band">
          <MetricKpiTile metric={metric} toShipFilter={toShipFilter} />
        </OpsKpiBandCell>
      ))}
    </OpsKpiBand>
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
    <section aria-label="Ready to Pack attention" className="shrink-0">
      {mode === 'history' ? (
        <HistoryStrip techId={techId} />
      ) : (
        <PendingStrip />
      )}
    </section>
  );
}
