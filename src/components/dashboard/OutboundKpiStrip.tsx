'use client';

/**
 * Outbound KPI strip — the dashboard's at-a-glance "proper dashboard" header for
 * the Outbound umbrella (Unshipped ⇄ Shipped), stacked ABOVE the board.
 *
 * Archetype: **Monitor** (contextual-display.md) — read-only, org-scoped rollup;
 * no durable selection, no mutation. It composes the house Monitor block registry
 * (`SectionCard`, `MetricTile` from `@/design-system/components/monitor`) — never a
 * local card shell — so it reads as a generic SaaS dashboard header.
 *
 * Layout: **two peer titled `SectionCard`s** on a sunken canvas band — a
 * distribution donut card ("Custody"/"Queue") beside a throughput card
 * ("Throughput"/"Readiness"). Both use the SAME 180° open-bottom gauge family
 * (`GaugeDonut` 150/13 ⇄ `MetricRing` 88/8 — same rounded caps, `surface-strong`
 * track, and proportional stroke). The throughput gauges render `bare` INSIDE the
 * second card as a **divided dial cluster** (label→ring→status cells split by
 * `divide-x` hairlines), so the width reads as one deliberate instrument bank, not
 * "four lonely widgets in a swimming pool".
 *
 * Interaction (Monitor filter-only — no durable selection, contextual-display.md):
 * in shipped mode the donut arcs AND the level-metric dials (delivered / in-custody
 * / exceptions) click-to-toggle the board's `?ostatus` via the SHARED
 * `useOutboundStatusFilter` — the same param the toolbar legend drives, so a filter
 * set from any of the three surfaces lights the others. Rate/trend dials (packed,
 * on-time) have no honest state filter, so they stay tooltip-only. Every dial
 * explains its numerator/denominator on hover via `HoverTooltip`.
 *
 * Loading contract (hardened): the donut source shares the WARM table cache (paints
 * instantly) while the throughput tiles are a SEPARATE, cold `useOperationsRoi`
 * fetch — so historically the donut popped in first and the tile grid flashed in
 * with a layout shift. Both halves now resolve into ONE `OutboundStripData` and
 * render behind ONE combined `isPending` gate: a reserved-slot skeleton holds the
 * exact final geometry, so the two halves appear together and the grid never
 * reflows mid-load. Settled-but-empty → a teaching empty; a failed source fetch →
 * a retryable error box (degrade, never a blank strip).
 *
 * Data: `GaugeDonut` arc hues come from `stateChartHex(...)` (same seeded tone as
 * the board status dot). Shipped counts share the table's React Query key (zero
 * extra fetch); throughput tiles use the org-scoped `useOperationsRoi`, gated on
 * `operations.view`. Tiles are zero-filtered — a metric with no populated data
 * (null-heavy deadline / dock-scan / labor columns) is dropped, never shown as 0.
 */

import type { ComponentType, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GaugeDonut, type GaugeSegment } from '@/features/operations/workspace/charts/GaugeDonut';
import { OUTBOUND_STATE_META, type OutboundState } from '@/lib/outbound-state';
import { UNSHIPPED_STATE_META } from '@/lib/unshipped-state';
import { stateChartHex } from '@/lib/labels/resolve';
import { useShippedScanOutData, ZERO_OUTBOUND_METRICS } from '@/hooks/useShippedScanOutData';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import { useOperationsRoi, type OperationsRoiData } from '@/features/operations/workspace/useOperationsRoi';
import { SectionCard, MetricTile, MONITOR_SECTION_CARD_PADDED } from '@/design-system/components/monitor';
import { resolveOutboundMetrics, type ComputedMetric } from '@/lib/dashboard/outbound-metrics';
import { useOutboundStatusFilter } from '@/components/shipped/useOutboundStatusFilter';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Truck, Activity, RefreshCw } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/utils/_cn';

/** Outbound pie order — folds PROCESS_GAP into EXCEPTION (matches the legend). */
const SHIPPED_DONUT_ORDER: OutboundState[] = [
  'PACKED_STAGED',
  'SCANNED_OUT',
  'IN_CUSTODY',
  'DELIVERED',
  'ORPHAN',
  'EXCEPTION',
];

/**
 * The throughput dials as ONE instrument bank, not a spread grid: a 2-col grid on
 * mobile that becomes a divided flex row on `lg` — equal cells split by hairline
 * rules (`divide-x`). The dividers make the full card width read as a deliberate
 * dial cluster (a car-dash / audio-console bank), the fix for "four lonely widgets
 * in a swimming pool of white space". Shared by the live cluster + its skeleton so
 * the geometry is identical (zero CLS on settle).
 */
const DIAL_CLUSTER_CLASS =
  'grid grid-cols-2 gap-x-2 gap-y-6 lg:flex lg:items-stretch lg:gap-0 lg:divide-x lg:divide-border-hairline';
const DIAL_CELL_CLASS = 'flex justify-center lg:flex-1 lg:px-3';

const EMPTY_UNSHIPPED = { total: 0, pending: 0, tested: 0, blocked: 0 };

/**
 * The one resolved shape both modes flow through. Because donut + tiles come from
 * a SINGLE object, the layout can gate both on one `isPending` and reveal them on
 * the same frame — the fix for "the donut always loads first".
 */
interface OutboundStripData {
  mode: 'shipped' | 'unshipped';
  /** Distribution (donut) card header. */
  eyebrow: string;
  centerLabel: string;
  /** Throughput (metrics) card header — the peer card's eyebrow + icon. */
  metricsEyebrow: string;
  metricsIcon: ComponentType<{ className?: string }>;
  segments: GaugeSegment[];
  metrics: ComputedMetric[];
  /** Skeleton tile count — holds the grid geometry so it never reflows on settle. */
  reservedSlots: number;
  /**
   * Shipped-mode `?ostatus` filter (the SAME hook the toolbar legend uses). When
   * present, the donut arcs + the level-metric dials become click-to-filter and the
   * active state lights across all three surfaces. Absent in unshipped mode (the
   * board lanes are the filter there), so those gauges stay read-only.
   */
  filter?: { active: OutboundState | null; toggle: (state: OutboundState) => void };
  /** Combined gate: true while EITHER the donut source OR the (gated) ROI fetch is cold. */
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Permission-gated ROI with a REAL pending flag. A disabled React-Query stays
 * `status: 'pending'` forever, so we read `isLoading` (pending ∧ actively
 * fetching) — false when the user lacks `operations.view`, true only on a genuine
 * cold fetch. That keeps the strip from waiting on a query that will never run.
 */
function useGatedRoi(): { roi: OperationsRoiData | null; pending: boolean } {
  const { isLoaded, has } = useAuth();
  const enabled = isLoaded && has('operations.view');
  const query = useOperationsRoi({ enabled });
  return { roi: query.data?.hasData ? query.data : null, pending: enabled && query.isLoading };
}

/** The distribution donut in a titled Monitor SectionCard — the left peer. Legend
 *  lives on the toolbar; the donut is `interactive` so hovering an arc reveals its
 *  label · value · share. `solo` stretches it full-width when no throughput card
 *  rides alongside it (rare: distribution present but no computable KPIs). */
function DistributionCard({
  eyebrow,
  segments,
  centerLabel,
  solo,
  onSelect,
  activeKey,
}: {
  eyebrow: string;
  segments: GaugeSegment[];
  centerLabel: string;
  solo: boolean;
  /** Click an arc to toggle the board's `?ostatus` filter (shipped mode only). */
  onSelect?: (key: string) => void;
  activeKey?: string | null;
}) {
  return (
    <SectionCard icon={Truck} eyebrow={eyebrow} className={solo ? 'lg:flex-1' : 'lg:w-[340px] lg:shrink-0'}>
      <div className="flex justify-center pt-1">
        <GaugeDonut
          segments={segments}
          centerLabel={centerLabel}
          size={150}
          thickness={13}
          interactive
          onSelect={onSelect}
          activeKey={activeKey}
        />
      </div>
    </SectionCard>
  );
}

/** The throughput KPIs in a titled Monitor SectionCard — the right peer. Gauges
 *  render `bare` inside this one card as a divided dial cluster (label→ring→status
 *  cells split by hairlines), so the strip is two peer instrument panels — never a
 *  card beside a grid of little cards. Level dials that map to a real outbound state
 *  (`filterState`) click through to the board's `?ostatus`; every dial explains its
 *  numerator/denominator on hover via `HoverTooltip`. */
function ThroughputCard({
  eyebrow,
  icon,
  metrics,
  filter,
}: {
  eyebrow: string;
  icon: ComponentType<{ className?: string }>;
  metrics: ComputedMetric[];
  filter?: { active: OutboundState | null; toggle: (state: OutboundState) => void };
}) {
  return (
    <SectionCard icon={icon} eyebrow={eyebrow} className="flex-1">
      <div className={DIAL_CLUSTER_CLASS}>
        {metrics.map(({ id, filterState, tooltip, ...tile }) => {
          const clickable = Boolean(filterState && filter);
          const active = Boolean(filterState && filter?.active === filterState);
          const dial = (
            <MetricTile
              bare
              {...tile}
              deltaVsLabel="vs last wk"
              active={active}
              onOpen={clickable ? () => filter?.toggle(filterState as OutboundState) : undefined}
            />
          );
          return (
            <div key={id} className={DIAL_CELL_CLASS}>
              {tooltip ? (
                // Not clickable → keep the tooltip focusable so keyboard users still
                // get the definition; clickable → the tile itself is the tab target.
                <HoverTooltip label={tooltip} focusable={!clickable} className="flex w-full justify-center">
                  {dial}
                </HoverTooltip>
              ) : (
                dial
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

/** A pulsing card-header placeholder (icon dot + eyebrow bar), matching the
 *  `SectionCard` header both peer cards render live. */
function SkeletonCardHeader() {
  return (
    <div className="mb-4 flex items-center gap-2">
      <div className="h-4 w-4 rounded bg-surface-strong" />
      <div className="h-2.5 w-16 rounded-full bg-surface-strong" />
    </div>
  );
}

/** Reserved-slot skeleton — two peer cards with the same header + ring geometry as
 *  the live strip, pulsing as one unit, so both halves arrive together and the
 *  gauge grid never reflows on settle. */
function OutboundStripSkeleton({ reservedSlots }: { reservedSlots: number }) {
  return (
    <div
      className="flex animate-pulse flex-col gap-4 lg:flex-row lg:items-stretch"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading outbound metrics…</span>
      <div className={cn(MONITOR_SECTION_CARD_PADDED, 'lg:w-[340px] lg:shrink-0')}>
        <SkeletonCardHeader />
        <div className="flex justify-center pt-1">
          {/* half-gauge placeholder — matches the GaugeDonut silhouette */}
          <div className="h-[89px] w-[150px] rounded-t-full border-[13px] border-b-0 border-surface-strong" />
        </div>
      </div>
      <div className={cn(MONITOR_SECTION_CARD_PADDED, 'flex-1')}>
        <SkeletonCardHeader />
        <div className={DIAL_CLUSTER_CLASS}>
          {Array.from({ length: reservedSlots }).map((_, i) => (
            <div key={i} className={DIAL_CELL_CLASS}>
              <div className="flex flex-col items-center gap-2 p-2">
                <div className="h-2.5 w-14 rounded-full bg-surface-strong" />
                <div className="h-[52px] w-[88px] rounded-t-full border-[8px] border-b-0 border-surface-strong" />
                <div className="h-2.5 w-12 rounded-full bg-surface-strong" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Settled-but-empty — a teaching line, not a zero-donut that reads as broken. */
function OutboundStripEmpty({ mode }: { mode: 'shipped' | 'unshipped' }) {
  const copy =
    mode === 'shipped'
      ? { title: 'No shipments this week.', hint: 'Packed and shipped units will roll up here.' }
      : { title: 'The unship queue is clear.', hint: 'Awaiting and tested units will roll up here.' };
  return (
    <div className="rounded-xl border border-dashed border-border-soft bg-surface-card px-4 py-8 text-center">
      <p className="text-caption font-bold text-text-soft">{copy.title}</p>
      <p className="mt-1 text-eyebrow font-semibold uppercase tracking-widest text-text-faint">{copy.hint}</p>
    </div>
  );
}

/** Source-fetch failure — degrade to a retryable box, never a blank strip. */
function OutboundStripError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-8 text-center">
      <p className="text-caption font-bold text-rose-700">Couldn&apos;t load outbound metrics.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 inline-flex items-center gap-1 rounded-md border border-rose-200 bg-surface-card px-2.5 py-1 text-eyebrow font-black uppercase tracking-widest text-rose-700 hover:bg-rose-100"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Try again
      </button>
    </div>
  );
}

/**
 * The one place the strip decides what to show — error → skeleton → empty →
 * content. Both halves render from the same resolved object, so they can never
 * again arrive on different frames.
 */
function OutboundStripLayout(data: OutboundStripData): ReactNode {
  if (data.isError) return <OutboundStripError onRetry={data.refetch} />;
  if (data.isPending) return <OutboundStripSkeleton reservedSlots={data.reservedSlots} />;

  const donutTotal = data.segments.reduce((sum, seg) => sum + seg.value, 0);
  if (donutTotal === 0 && data.metrics.length === 0) return <OutboundStripEmpty mode={data.mode} />;

  const hasMetrics = data.metrics.length > 0;
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
      <DistributionCard
        eyebrow={data.eyebrow}
        segments={data.segments}
        centerLabel={data.centerLabel}
        solo={!hasMetrics}
        onSelect={data.filter ? (key) => data.filter?.toggle(key as OutboundState) : undefined}
        activeKey={data.filter?.active ?? null}
      />
      {hasMetrics && (
        <ThroughputCard
          eyebrow={data.metricsEyebrow}
          icon={data.metricsIcon}
          metrics={data.metrics}
          filter={data.filter}
        />
      )}
    </div>
  );
}

function ShippedStrip() {
  const { counts, total, metrics, isPending, isError, refetch } = useShippedScanOutData();
  const { roi, pending: roiPending } = useGatedRoi();
  const filter = useOutboundStatusFilter();

  const segments: GaugeSegment[] = SHIPPED_DONUT_ORDER.map((state) => ({
    key: state,
    label: OUTBOUND_STATE_META[state].label,
    value: counts[state] + (state === 'EXCEPTION' ? counts.PROCESS_GAP : 0),
    color: stateChartHex('outbound', state),
  }));

  return OutboundStripLayout({
    mode: 'shipped',
    eyebrow: 'Custody',
    centerLabel: 'Packed',
    metricsEyebrow: 'Throughput',
    metricsIcon: Activity,
    segments,
    metrics: resolveOutboundMetrics({ mode: 'shipped', total, shipped: metrics, unshipped: EMPTY_UNSHIPPED, roi }),
    reservedSlots: 4,
    filter,
    isPending: isPending || roiPending,
    isError,
    refetch,
  });
}

function UnshippedStrip() {
  const query = useQuery(unshippedQueueCountsQuery());
  const { roi, pending: roiPending } = useGatedRoi();
  const { data } = query;

  const segments: GaugeSegment[] = [
    { key: 'PENDING', label: UNSHIPPED_STATE_META.PENDING.label, value: data?.byStage.pending ?? 0, color: stateChartHex('unshipped', 'PENDING') },
    { key: 'TESTED', label: UNSHIPPED_STATE_META.TESTED.label, value: data?.byStage.tested ?? 0, color: stateChartHex('unshipped', 'TESTED') },
  ];
  const unshipped = {
    total: data?.total ?? 0,
    pending: data?.byStage.pending ?? 0,
    tested: data?.byStage.tested ?? 0,
    blocked: (data?.combos ?? []).reduce((s, c) => s + (c.blocked ? c.count : 0), 0),
  };

  return OutboundStripLayout({
    mode: 'unshipped',
    eyebrow: 'Queue',
    centerLabel: 'In queue',
    metricsEyebrow: 'Readiness',
    metricsIcon: Activity,
    segments,
    metrics: resolveOutboundMetrics({ mode: 'unshipped', total: unshipped.total, shipped: ZERO_OUTBOUND_METRICS, unshipped, roi }),
    reservedSlots: 3,
    isPending: query.isPending || roiPending,
    isError: query.isError,
    refetch: query.refetch,
  });
}

export function OutboundKpiStrip({ mode }: { mode: 'unshipped' | 'shipped' }) {
  // No own horizontal padding — the dashboard content column owns the gutter so
  // the KPI strip, Unshipped/Shipped control bar, and board share one left/right edge.
  return (
    <section aria-label="Outbound KPIs" data-strip-rev="cluster-1" className="shrink-0">
      {mode === 'shipped' ? <ShippedStrip /> : <UnshippedStrip />}
    </section>
  );
}
