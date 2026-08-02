'use client';

/**
 * Outbound attention strip — the dashboard's "what's down and what needs me right
 * now" header for the Outbound umbrella (Unshipped ⇄ Shipped), stacked ABOVE the
 * board.
 *
 * Archetype: **Monitor** (contextual-display.md) — read-only, org-scoped rollup;
 * no durable selection, no mutation. It composes the house Monitor KPI anatomy
 * (`KpiTile` from `@/design-system/components/monitor`) — the SAME
 * eyebrow + compact delta (top-right) → hero shape as every other dashboard, never a second gauge
 * language — so the strip reads as one family with `OperationsAnalyticsView`.
 *
 * Job (the redesign): this is an **attention header**, not a status mirror. It
 * answers three questions and drops everything else:
 *   • "What's in the Pending queue?" — the **queue** zone (unshipped only):
 *     Pending → Urgent → Out of stock, pinned left in that order. Urgent and
 *     Out of stock click-to-filter the board; Pending clears refines and shows
 *     the full tab.
 *   • "What needs me right now?" — the **attention** zone: severity-ranked
 *     actionable facts (units stuck, ready-to-pack, exceptions, …). Sorted by
 *     `severity` DESC; hero toned by intent (danger/warning). Healthy or
 *     zero-count metrics simply don't appear.
 *   • "What's down from previous weeks?" — the **trend** zone: metrics carrying an
 *     honest week-over-week `delta`. Today only throughput has a real prior-week
 *     baseline (`useOperationsRoi.pctChange`).
 *
 * Pure status with neither severity nor a delta (delivered, in-transit) is
 * intentionally NOT shown — it's not "what needs you", and it already lives on
 * the board legend / lanes below. When all zones are empty the strip shows a
 * calm all-clear.
 *
 * The zoning + sort is pure and testable in `@/lib/dashboard/outbound-metrics`
 * (`splitOutboundAttention`); this file only renders it.
 *
 * Interaction (Monitor filter-only — no durable selection, contextual-display.md):
 * attention tiles that map to a real board state click-to-toggle via a SHARED
 * URL hook so a filter set from either the strip or the toolbar lights the other:
 *   • shipped → `?ostatus` via `useOutboundStatusFilter`
 *   • Pending / Tested tabs → lifecycle view switch (or `?ustatus=BLOCKED` /
 *     `?attention=1` via `useToShipFilterActions`)
 * Every tile explains its numerator/denominator on hover via `HoverTooltip`.
 *
 * Loading contract (unchanged): the counts source shares the WARM table cache while
 * the throughput trend is a SEPARATE, cold `useOperationsRoi` fetch. Both resolve
 * into ONE `OutboundStripData` behind ONE combined `isPending` gate — a reserved
 * tile skeleton holds the geometry so the two halves arrive together and the grid
 * never reflows mid-load. Settled-but-empty → all-clear; a failed source fetch → a
 * retryable error box (degrade, never a blank strip).
 */

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useShippedScanOutData, ZERO_OUTBOUND_METRICS } from '@/hooks/useShippedScanOutData';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import { KpiTile, metricIntentTextClass, MONITOR_KPI_TILE_CLASS } from '@/design-system/components/monitor';
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
import { RefreshCw } from '@/components/Icons';
import { AnimatedCheck } from '@/components/ui/AnimatedCheck';
import { cn } from '@/utils/_cn';
import type { FulfillmentState } from '@/lib/unshipped-state';
import {
  getDashboardOrderViewFromSearch,
  type DashboardOrderView,
} from '@/utils/dashboard-search-state';
import { useSearchParams } from 'next/navigation';

const EMPTY_UNSHIPPED = { total: 0, pending: 0, tested: 0, blocked: 0, urgent: 0 };

/** The shipped board's `?ostatus` filter, threaded to attention tiles that map to
 *  a real outbound state. Absent in unshipped mode. */
type OutboundFilter = { active: OutboundState | null; toggle: (state: OutboundState) => void };

/** Pre-pack click targets — lifecycle tab and/or Blocked / Urgent refine. */
type ToShipFilter = {
  active: FulfillmentState | null;
  orderView: DashboardOrderView;
  urgentOnly: boolean;
  toggle: (state: FulfillmentState) => void;
  selectView: (view: DashboardOrderView) => void;
  /** Jump to Pending and toggle Out-of-stock refine in one URL write. */
  toggleBlocked: () => void;
  /** Toggle Urgent-only (`?attention=1`). */
  toggleUrgent: () => void;
  /** Full Pending tab — clear OOS / urgent refines in one URL write. */
  selectPendingTab: () => void;
};

/**
 * The one resolved shape both modes flow through. Because counts + trend come from
 * a SINGLE object, the layout gates both on one `isPending` and reveals them on the
 * same frame — the fix for "the counts always load before the trend".
 */
interface OutboundStripData {
  mode: 'shipped' | 'unshipped';
  metrics: ComputedMetric[];
  /** Shipped-mode click-to-filter; absent in unshipped. */
  filter?: OutboundFilter;
  /** Unshipped-mode click-to-filter; absent in shipped. */
  toShipFilter?: ToShipFilter;
  /** Skeleton tile count — holds the grid geometry so it never reflows on settle. */
  reservedSlots: number;
  /** Combined gate: true while EITHER the counts source OR the (gated) ROI fetch is cold. */
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
}

/** Flex band shared by the live strip and its skeleton so geometry is identical
 *  (zero CLS on settle). Tiles grow to fill — a few tiles stretch to the full width
 *  instead of huddling as "lonely widgets in a swimming pool"; many tiles wrap. */
const TILE_BAND_CLASS = 'flex flex-wrap gap-3';
const TILE_CELL_CLASS = 'min-w-0 grow basis-40';

/** One metric as a house `KpiTile`. Attention items (severity > 0) tone their hero
 *  by intent; trend items carry a compact top-right delta. A tile that maps to a
 *  board state click-to-filters that board. */
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

  // Tone the hero only for genuine problems (warn/bad); a neutral backlog stays
  // default ink so pressure never masquerades as failure.
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
          // BLOCKED — Pending tab + OOS refine in one navigation.
          toShipFilter.toggleBlocked();
        }
      : undefined;

  const tile = (
    <KpiTile
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
    // Not clickable → keep the tooltip focusable so keyboard users still get the
    // definition; clickable → the tile itself is the tab target.
    <HoverTooltip label={metric.tooltip} focusable={!clickable} className="block h-full">
      {tile}
    </HoverTooltip>
  );
}

/** A pulsing KPI-tile placeholder (label + delta slot → hero) matching the
 *  live `KpiTile` geometry. */
function SkeletonKpiTile() {
  return (
    <div className={cn(MONITOR_KPI_TILE_CLASS, 'h-full')}>
      <div className="flex items-start justify-between gap-3">
        <div className="h-2.5 w-16 rounded-full bg-surface-strong" />
        <div className="h-2.5 w-8 rounded-full bg-surface-strong" />
      </div>
      <div className="mt-2 h-7 w-14 rounded bg-surface-strong" />
    </div>
  );
}

/** Reserved-slot skeleton — a flat band of KPI tiles with the same geometry as the
 *  live strip, pulsing as one unit, so the grid never reflows on settle. */
function OutboundStripSkeleton({ reservedSlots }: { reservedSlots: number }) {
  return (
    <div className={cn(TILE_BAND_CLASS, 'animate-pulse')} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading outbound attention metrics…</span>
      {Array.from({ length: reservedSlots }).map((_, i) => (
        <div key={i} className={TILE_CELL_CLASS}>
          <SkeletonKpiTile />
        </div>
      ))}
    </div>
  );
}

/** Settled with nothing needing attention — a calm all-clear, not a broken blank. */
function OutboundStripAllClear({ mode }: { mode: 'shipped' | 'unshipped' }) {
  const copy =
    mode === 'shipped'
      ? { title: 'Nothing needs attention.', hint: 'Blockers, exceptions, and week-over-week trends surface here.' }
      : { title: 'The queue is clear.', hint: 'Pending, urgent, and out-of-stock counts surface here.' };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-border-soft bg-surface-card px-4 py-5">
      <AnimatedCheck size={20} />
      <div className="min-w-0">
        <p className="text-role-caption font-semibold text-text-default">{copy.title}</p>
        <p className="mt-0.5 text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">{copy.hint}</p>
      </div>
    </div>
  );
}

/** Source-fetch failure — degrade to a retryable box, never a blank strip. */
function OutboundStripError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-8 text-center">
      <p className="text-role-caption font-semibold text-rose-700">Couldn&apos;t load outbound metrics.</p>
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

/**
 * The one place the strip decides what to show — error → skeleton → all-clear →
 * content. The attention split is pure (`splitOutboundAttention`), so ordering and
 * zoning are decided in the lib, not here.
 */
function OutboundStripLayout(data: OutboundStripData): ReactNode {
  if (data.isError) return <OutboundStripError onRetry={data.refetch} />;
  if (data.isPending) return <OutboundStripSkeleton reservedSlots={data.reservedSlots} />;

  const { queue, attention, trend } = splitOutboundAttention(data.metrics);
  const tiles = [...queue, ...attention, ...trend];
  if (tiles.length === 0) return <OutboundStripAllClear mode={data.mode} />;

  return (
    <div className={TILE_BAND_CLASS}>
      {tiles.map((metric) => (
        <div key={metric.id} className={TILE_CELL_CLASS}>
          <MetricKpiTile metric={metric} filter={data.filter} toShipFilter={data.toShipFilter} />
        </div>
      ))}
    </div>
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
  // No own horizontal padding — the dashboard content column owns the gutter so
  // the strip, Unshipped/Shipped control bar, and board share one left/right edge.
  return (
    <section aria-label="Outbound attention" data-strip-rev="attention-1" className="shrink-0">
      {mode === 'shipped' ? <ShippedStrip /> : <UnshippedStrip />}
    </section>
  );
}
