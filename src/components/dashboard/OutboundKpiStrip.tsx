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

import { useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useShippedScanOutData, ZERO_OUTBOUND_METRICS } from '@/hooks/useShippedScanOutData';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import { usePackedOrdersFeed } from '@/hooks/usePackedOrdersFeed';
import { packedDateWindowLabel, summarizePackedFilter } from '@/lib/packed/packed-filters';
import { useStaffFilter } from '@/hooks/useStaffFilter';
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
import { parseStaffParam } from '@/hooks/useStaffFilter';
import {
  getDashboardOrderViewFromSearch,
  type DashboardOrderView,
} from '@/utils/dashboard-search-state';
import { useSearchParams } from 'next/navigation';
import { PACK_PLACED_PARAM } from '@/lib/packing/pack-station-arm';

const EMPTY_UNSHIPPED = {
  total: 0,
  pending: 0,
  tested: 0,
  blocked: 0,
  urgent: 0,
  mustShip: 0,
  atStations: 0,
};

type OutboundFilter = { active: OutboundState | null; toggle: (state: OutboundState) => void };

type ToShipFilter = {
  active: FulfillmentState | null;
  orderView: DashboardOrderView;
  urgentOnly: boolean;
  lateOnly: boolean;
  packPlacedOnly: boolean;
  toggle: (state: FulfillmentState) => void;
  selectView: (view: DashboardOrderView) => void;
  toggleBlocked: () => void;
  toggleUrgent: () => void;
  toggleMustShip: () => void;
  togglePackPlaced: () => void;
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
    toShipFilter &&
      (metric.filterUstatus ||
        metric.filterAttention ||
        metric.filterLate ||
        metric.filterPackPlaced),
  );
  const clickable = shippedClickable || toShipClickable;
  const lane = metric.filterUstatus;
  const active = Boolean(
    (metric.filterState && filter?.active === metric.filterState) ||
      (metric.filterAttention && toShipFilter?.urgentOnly) ||
      (metric.filterLate && toShipFilter?.lateOnly) ||
      (metric.filterPackPlaced && toShipFilter?.packPlacedOnly) ||
      (lane === 'BLOCKED' && toShipFilter?.active === 'BLOCKED') ||
      (lane === 'TESTED' && toShipFilter?.active === 'TESTED') ||
      (lane === 'PENDING' &&
        toShipFilter?.active !== 'BLOCKED' &&
        toShipFilter?.active !== 'TESTED' &&
        !toShipFilter?.urgentOnly &&
        !toShipFilter?.lateOnly),
  );

  const toneHero = metric.intent === 'warn' || metric.intent === 'bad';

  const onOpen = shippedClickable
    ? () => filter?.toggle(metric.filterState as OutboundState)
    : toShipClickable && toShipFilter
      ? () => {
          if (metric.filterPackPlaced) {
            toShipFilter.togglePackPlaced();
            return;
          }
          if (metric.filterLate) {
            toShipFilter.toggleMustShip();
            return;
          }
          if (metric.filterAttention) {
            toShipFilter.toggleUrgent();
            return;
          }
          if (lane === 'TESTED') {
            // Same list, `?ustatus=TESTED` — not a lifecycle tab swap.
            toShipFilter.toggle('TESTED');
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
      labelClassName="normal-case tracking-normal"
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
    <OpsKpiBand density="band" className="animate-pulse [&>*:not(:last-child)]:border-r-0" aria-label="Loading outbound attention metrics">
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
    <OpsKpiBand density="band" aria-label="Outbound attention metrics" className="[&>*:not(:last-child)]:border-r-0">
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
  const searchParams = useSearchParams();
  const staffId = parseStaffParam(searchParams.get('staff')) ?? undefined;
  const query = useQuery(unshippedQueueCountsQuery({ staffId }));
  const { roi, pending: roiPending } = useGatedOperationsRoi();
  const {
    active,
    urgentOnly,
    lateOnly,
    toggle,
    toggleBlocked,
    toggleUrgent,
    toggleMustShip,
    selectPendingTab,
    selectLifecycleTab,
    togglePackPlaced,
  } = useToShipFilterActions();
  const orderView = getDashboardOrderViewFromSearch(searchParams);
  const packPlacedOnly =
    searchParams.get(PACK_PLACED_PARAM) === '1' ||
    searchParams.get(PACK_PLACED_PARAM) === 'true';

  const toShipFilter: ToShipFilter = {
    active,
    orderView,
    urgentOnly,
    lateOnly,
    packPlacedOnly,
    toggle,
    selectView: (view) => {
      if (view === 'unshipped' || view === 'tested') selectLifecycleTab(view);
    },
    toggleBlocked,
    toggleUrgent,
    toggleMustShip,
    togglePackPlaced,
    selectPendingTab,
  };
  const { data } = query;

  const unshipped = {
    total: data?.total ?? 0,
    pending: data?.byStage.pending ?? 0,
    tested: data?.byStage.tested ?? 0,
    blocked: (data?.combos ?? []).reduce((s, c) => s + (c.blocked ? c.count : 0), 0),
    urgent: data?.urgent ?? 0,
    mustShip: data?.mustShip ?? 0,
    atStations: data?.packPlacement?.totalPlaced ?? 0,
  };

  // The per-bench ORDER breakdown moved into the Band-3 find field on
  // 2026-08-10 (`PackBenchRefineFacet`) — it narrows rows, so it belongs beside the
  // query, and a full-width chip row here cost a band of height on the densest
  // desk in the app. The aggregate "At stations" tile stays: that is the
  // at-a-glance number, and it is an attention metric rather than a facet.
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

function PackedStrip() {
  const { records, query, staffId, dateFrom, dateTo } = usePackedOrdersFeed();
  const { selectedName } = useStaffFilter();
  const summary = useMemo(() => summarizePackedFilter(records), [records]);
  const staffTiles = staffId
    ? summary.byStaff.filter((s) => s.staffId === staffId)
    : summary.byStaff.slice(0, 5);
  const windowLabel = packedDateWindowLabel(dateFrom ?? null, dateTo ?? null);
  const filterLabel = selectedName
    ? windowLabel
      ? `${selectedName} · ${windowLabel}`
      : selectedName
    : windowLabel ?? 'Packed';

  const metrics: ComputedMetric[] = [
    {
      id: 'packed-filter',
      label: filterLabel,
      value: summary.packages.toLocaleString(),
      fraction: 1,
      intent: 'neutral',
      severity: 1,
      tooltip: selectedName
        ? `${summary.packages} package${summary.packages === 1 ? '' : 's'} packed by ${selectedName}${windowLabel ? ` (${windowLabel})` : ''}. ${summary.orders} order row${summary.orders === 1 ? '' : 's'}.`
        : `${summary.packages} package${summary.packages === 1 ? '' : 's'} in the Packed filter${windowLabel ? ` (${windowLabel})` : ''}. ${summary.orders} order row${summary.orders === 1 ? '' : 's'}.`,
    },
    ...staffTiles.map((staff) => ({
      id: `packer-${staff.staffId ?? 'none'}`,
      label: staff.name,
      value: staff.packages.toLocaleString(),
      fraction: summary.packages > 0 ? staff.packages / summary.packages : 0,
      intent: 'neutral' as const,
      severity: 1,
      tooltip: `${staff.packages} package${staff.packages === 1 ? '' : 's'} packed by ${staff.name} in this filter.`,
    })),
  ];

  // When a staff is selected, the headline tile IS their count — don't repeat it.
  const tiles = staffId
    ? metrics.slice(0, 1)
    : metrics.filter((m, i) => i === 0 || m.id !== 'packed-filter');

  return OutboundStripLayout({
    mode: 'shipped',
    metrics: tiles,
    reservedSlots: staffId ? 1 : Math.min(6, 1 + staffTiles.length),
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  });
}

export function OutboundKpiStrip({ mode }: { mode: 'unshipped' | 'tested' | 'shipped' | 'packed' }) {
  return (
    <section
      aria-label="Outbound attention"
      data-strip-rev="attention-band-1"
      data-testid={mode === 'packed' ? 'packed-kpi-band' : undefined}
      className="shrink-0"
    >
      {mode === 'packed' ? <PackedStrip /> : mode === 'shipped' ? <ShippedStrip /> : <UnshippedStrip />}
    </section>
  );
}
