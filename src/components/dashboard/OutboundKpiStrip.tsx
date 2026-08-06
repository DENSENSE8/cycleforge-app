'use client';

/**
 * Outbound attention strip — To-ship / Shipped Band 2.
 *
 * Workbench Band 2 altitude: flush `KpiTile density="band"` (not Monitor
 * `rounded-2xl p-4` cards). Filter URL behavior unchanged.
 *
 * Job: attention header — queue · severity · trend zones via
 * `splitOutboundAttention`. Click-to-filter via shared URL hooks.
 */

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useShippedScanOutData, ZERO_OUTBOUND_METRICS } from '@/hooks/useShippedScanOutData';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import {
  KpiTile,
  metricIntentTextClass,
  OpsKpiBand,
  OpsKpiBandCell,
  OpsKpiBandEmpty,
  OpsKpiBandError,
  OpsKpiBandSkeletonTile,
} from '@/design-system/components/monitor';
import {
  resolveOutboundMetrics,
  splitOutboundAttention,
  type ComputedMetric,
} from '@/lib/dashboard/outbound-metrics';
import type { OutboundState } from '@/lib/outbound-state';
import { useOutboundStatusFilter } from '@/components/shipped/useOutboundStatusFilter';
import { useToShipFilterActions } from '@/components/dashboard/OutboundFilterStrip';
import { useGatedOperationsRoi } from '@/features/operations/workspace/useGatedOperationsRoi';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import type { FulfillmentState } from '@/lib/unshipped-state';
import {
  getDashboardOrderViewFromSearch,
  type DashboardOrderView,
} from '@/utils/dashboard-search-state';
import { useSearchParams } from 'next/navigation';

const EMPTY_UNSHIPPED = { total: 0, pending: 0, tested: 0, blocked: 0, urgent: 0 };

type OutboundFilter = { active: OutboundState | null; toggle: (state: OutboundState) => void };

type ToShipFilter = {
  active: FulfillmentState | null;
  orderView: DashboardOrderView;
  urgentOnly: boolean;
  toggle: (state: FulfillmentState) => void;
  selectView: (view: DashboardOrderView) => void;
  toggleBlocked: () => void;
  toggleUrgent: () => void;
  selectPendingTab: () => void;
};

interface OutboundStripData {
  mode: 'shipped' | 'unshipped';
  metrics: ComputedMetric[];
  filter?: OutboundFilter;
  toShipFilter?: ToShipFilter;
  reservedSlots: number;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
}

function MetricKpiTile({
  metric,
  filter,
  toShipFilter,
}: {
  metric: ComputedMetric;
  filter?: OutboundFilter;
  toShipFilter?: ToShipFilter;
}) {
  const tone = metricIntentTextClass(metric.intent);
  const shippedClickable = Boolean(metric.filterState && filter);
  const toShipClickable = Boolean(
    toShipFilter && (metric.filterUstatus || metric.filterAttention),
  );
  const clickable = shippedClickable || toShipClickable;
  const lane = metric.filterUstatus;
  const active = Boolean(
    (metric.filterState && filter?.active === metric.filterState) ||
      (metric.filterAttention && toShipFilter?.urgentOnly) ||
      (lane === 'BLOCKED' && toShipFilter?.active === 'BLOCKED') ||
      (lane === 'TESTED' && toShipFilter?.orderView === 'tested') ||
      (lane === 'PENDING' &&
        toShipFilter?.orderView === 'unshipped' &&
        toShipFilter?.active !== 'BLOCKED' &&
        !toShipFilter?.urgentOnly),
  );

  const toneHero = metric.intent === 'warn' || metric.intent === 'bad';

  const onOpen = shippedClickable
    ? () => filter?.toggle(metric.filterState as OutboundState)
    : toShipClickable && toShipFilter
      ? () => {
          if (metric.filterAttention) {
            toShipFilter.toggleUrgent();
            return;
          }
          if (lane === 'TESTED') {
            if (toShipFilter.orderView === 'tested') toShipFilter.selectView('unshipped');
            else toShipFilter.selectView('tested');
            return;
          }
          if (lane === 'PENDING') {
            toShipFilter.selectPendingTab();
            return;
          }
          toShipFilter.toggleBlocked();
        }
      : undefined;

  const tile = (
    <KpiTile
      density="band"
      label={metric.label}
      value={metric.value}
      valueClassName={toneHero ? tone : undefined}
      delta={metric.delta}
      invertDelta={metric.deltaInvert}
      active={active}
      onOpen={onOpen}
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

function OutboundStripSkeleton({ reservedSlots }: { reservedSlots: number }) {
  return (
    <OpsKpiBand density="band" className="animate-pulse" aria-label="Loading outbound attention metrics">
      <span className="sr-only">Loading outbound attention metrics…</span>
      {Array.from({ length: reservedSlots }).map((_, i) => (
        <OpsKpiBandCell key={i} density="band">
          <OpsKpiBandSkeletonTile density="band" />
        </OpsKpiBandCell>
      ))}
    </OpsKpiBand>
  );
}

function OutboundStripLayout(data: OutboundStripData): ReactNode {
  if (data.isError) {
    return (
      <OpsKpiBandError
        density="band"
        message="Couldn't load outbound metrics."
        onRetry={data.refetch}
      />
    );
  }
  if (data.isPending) return <OutboundStripSkeleton reservedSlots={data.reservedSlots} />;

  const { queue, attention, trend } = splitOutboundAttention(data.metrics);
  const tiles = [...queue, ...attention, ...trend];
  if (tiles.length === 0) {
    return (
      <OpsKpiBandEmpty
        density="band"
        title={data.mode === 'shipped' ? 'Nothing needs attention.' : 'The queue is clear.'}
        description={
          data.mode === 'shipped'
            ? 'Blockers, exceptions, and week-over-week trends surface here.'
            : 'Pending, urgent, and out-of-stock counts surface here.'
        }
      />
    );
  }

  return (
    <OpsKpiBand density="band" aria-label="Outbound attention metrics">
      {tiles.map((metric) => (
        <OpsKpiBandCell key={metric.id} density="band">
          <MetricKpiTile metric={metric} filter={data.filter} toShipFilter={data.toShipFilter} />
        </OpsKpiBandCell>
      ))}
    </OpsKpiBand>
  );
}

function ShippedStrip() {
  const { total, metrics, isPending, isError, refetch } = useShippedScanOutData();
  const { roi, pending: roiPending } = useGatedOperationsRoi();
  const filter = useOutboundStatusFilter();

  return OutboundStripLayout({
    mode: 'shipped',
    metrics: resolveOutboundMetrics({ mode: 'shipped', total, shipped: metrics, unshipped: EMPTY_UNSHIPPED, roi }),
    reservedSlots: 3,
    filter,
    isPending: isPending || roiPending,
    isError,
    refetch,
  });
}

function UnshippedStrip() {
  const query = useQuery(unshippedQueueCountsQuery());
  const { roi, pending: roiPending } = useGatedOperationsRoi();
  const {
    active,
    urgentOnly,
    toggle,
    toggleBlocked,
    toggleUrgent,
    selectPendingTab,
    selectLifecycleTab,
  } = useToShipFilterActions();
  const searchParams = useSearchParams();
  const orderView = getDashboardOrderViewFromSearch(searchParams);

  const toShipFilter: ToShipFilter = {
    active,
    orderView,
    urgentOnly,
    toggle,
    selectView: (view) => {
      if (view === 'unshipped' || view === 'tested') selectLifecycleTab(view);
    },
    toggleBlocked,
    toggleUrgent,
    selectPendingTab,
  };
  const { data } = query;

  const unshipped = {
    total: data?.total ?? 0,
    pending: data?.byStage.pending ?? 0,
    tested: data?.byStage.tested ?? 0,
    blocked: (data?.combos ?? []).reduce((s, c) => s + (c.blocked ? c.count : 0), 0),
    urgent: data?.urgent ?? 0,
  };

  return OutboundStripLayout({
    mode: 'unshipped',
    metrics: resolveOutboundMetrics({
      mode: 'unshipped',
      total: unshipped.total,
      shipped: ZERO_OUTBOUND_METRICS,
      unshipped,
      roi,
    }),
    reservedSlots: 5,
    toShipFilter,
    isPending: query.isPending || roiPending,
    isError: query.isError,
    refetch: query.refetch,
  });
}

export function OutboundKpiStrip({ mode }: { mode: 'unshipped' | 'tested' | 'shipped' }) {
  return (
    <section aria-label="Outbound attention" data-strip-rev="attention-band-1" className="shrink-0">
      {mode === 'shipped' ? <ShippedStrip /> : <UnshippedStrip />}
    </section>
  );
}
