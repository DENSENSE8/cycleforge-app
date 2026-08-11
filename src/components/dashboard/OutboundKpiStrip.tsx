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
import { parseStaffParam } from '@/hooks/useStaffFilter';
import {
  getDashboardOrderViewFromSearch,
  type DashboardOrderView,
} from '@/utils/dashboard-search-state';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PACK_PLACED_PARAM, PACK_STATION_PARAM } from '@/lib/packing/pack-station-arm';
import { PackBenchChipRow } from '@/components/packing/PackBenchChipRow';
import type { PackPlacementCountRow } from '@/lib/packing/pack-placement';

const EMPTY_UNSHIPPED = {
  total: 0,
  pending: 0,
  tested: 0,
  blocked: 0,
  urgent: 0,
  atStations: 0,
};

type OutboundFilter = { active: OutboundState | null; toggle: (state: OutboundState) => void };

type ToShipFilter = {
  active: FulfillmentState | null;
  orderView: DashboardOrderView;
  urgentOnly: boolean;
  packPlacedOnly: boolean;
  toggle: (state: FulfillmentState) => void;
  selectView: (view: DashboardOrderView) => void;
  toggleBlocked: () => void;
  toggleUrgent: () => void;
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
      (metric.filterUstatus || metric.filterAttention || metric.filterPackPlaced),
  );
  const clickable = shippedClickable || toShipClickable;
  const lane = metric.filterUstatus;
  const active = Boolean(
    (metric.filterState && filter?.active === metric.filterState) ||
      (metric.filterAttention && toShipFilter?.urgentOnly) ||
      (metric.filterPackPlaced && toShipFilter?.packPlacedOnly) ||
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
          if (metric.filterPackPlaced) {
            toShipFilter.togglePackPlaced();
            return;
          }
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

/**
 * Per-bench ORDER breakdown under the To-ship band (P3d) — parity with the
 * Ready-to-Pack strip, which already answers "how many at each bench" for the
 * desk operator. Counts come from `queue-counts.packPlacement.counts`, the same
 * payload the aggregate "At stations" tile reads, so this costs no extra fetch.
 *
 * It stays a chip row rather than KPI tiles on purpose: a bench breakdown is
 * context beside the aggregate, and the band's attention zone caps at four
 * tiles — N benches would crowd out pending / urgent / out-of-stock.
 *
 * Clicking a bench filters the board (`?packStation=`); it does NOT arm a place
 * target. Arming is a scan destination and belongs to the bench itself.
 */
function OrderBenchStrip({
  counts,
  activeLocationId,
  onSelect,
}: {
  counts: readonly PackPlacementCountRow[];
  activeLocationId: number | null;
  onSelect: (row: { locationId: number }) => void;
}) {
  return (
    <PackBenchChipRow
      label="Orders at bench"
      rows={counts}
      testId="order-bench"
      itemNoun="order"
      activeLocationId={activeLocationId}
      onSelect={onSelect}
    />
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
  const pathname = usePathname();
  const router = useRouter();
  const staffId = parseStaffParam(searchParams.get('staff')) ?? undefined;
  const query = useQuery(unshippedQueueCountsQuery({ staffId }));
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
  const orderView = getDashboardOrderViewFromSearch(searchParams);
  const packPlacedOnly =
    searchParams.get(PACK_PLACED_PARAM) === '1' ||
    searchParams.get(PACK_PLACED_PARAM) === 'true';

  const packStationParam = Number(searchParams.get(PACK_STATION_PARAM));
  const activePackStationId =
    Number.isFinite(packStationParam) && packStationParam > 0 ? packStationParam : null;

  /**
   * Bench filter — mutually exclusive with the aggregate `?packPlaced=1`, the
   * same way {@link togglePackPlaced} clears the bench param. "Placed anywhere"
   * and "placed at THIS bench" are two answers to one question; holding both
   * would let the board show a filter combination neither chip is claiming.
   */
  const togglePackStation = (locationId: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (activePackStationId === locationId) {
      params.delete(PACK_STATION_PARAM);
    } else {
      params.set(PACK_STATION_PARAM, String(locationId));
      params.delete(PACK_PLACED_PARAM);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const togglePackPlaced = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (packPlacedOnly) params.delete(PACK_PLACED_PARAM);
    else {
      params.set(PACK_PLACED_PARAM, '1');
      params.delete(PACK_STATION_PARAM);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const toShipFilter: ToShipFilter = {
    active,
    orderView,
    urgentOnly,
    packPlacedOnly,
    toggle,
    selectView: (view) => {
      if (view === 'unshipped' || view === 'tested') selectLifecycleTab(view);
    },
    toggleBlocked,
    toggleUrgent,
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
    atStations: data?.packPlacement?.totalPlaced ?? 0,
  };

  // The per-bench ORDER breakdown moved into the Band-3 find field on
  // 2026-08-10 (`BenchRefineFacet`) — it narrows rows, so it belongs beside the
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

export function OutboundKpiStrip({ mode }: { mode: 'unshipped' | 'tested' | 'shipped' }) {
  return (
    <section aria-label="Outbound attention" data-strip-rev="attention-band-1" className="shrink-0">
      {mode === 'shipped' ? <ShippedStrip /> : <UnshippedStrip />}
    </section>
  );
}
