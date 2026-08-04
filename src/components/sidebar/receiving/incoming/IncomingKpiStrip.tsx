'use client';

/**
 * Inbound desk KPI band — Pipeline vs Docked (Triage / Unbox) attention tiles.
 * Reads the same 30s-polled `useIncomingSummary` aggregate as the sidebar.
 */

import { useSearchParams } from 'next/navigation';
import {
  KpiTile,
  metricIntentTextClass,
  MONITOR_KPI_TILE_CLASS,
  type MetricIntent,
} from '@/design-system/components/monitor';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { parseInboundLane } from '@/lib/receiving/inbound-lane';
import {
  dashboardReceivingTabFromSort,
  type DashboardReceivingTab,
} from './inbound-docked-tabs';
import type { IncomingSummary } from './incoming-summary-types';
import { useIncomingSummary } from './useIncomingSummary';
import { cn } from '@/utils/_cn';

const TILE_BAND_CLASS = 'flex flex-wrap gap-3';
const TILE_CELL_CLASS = 'min-w-0 grow basis-40';

interface IncomingMetric {
  id: string;
  label: string;
  value: number;
  intent: MetricIntent;
  status?: string;
  tooltip?: string;
}

function MetricKpiTile({ metric }: { metric: IncomingMetric }) {
  const tone = metricIntentTextClass(metric.intent);
  const tile = (
    <KpiTile
      label={metric.label}
      value={metric.value.toLocaleString()}
      valueClassName={metric.intent === 'warn' || metric.intent === 'bad' ? tone : undefined}
      className="h-full"
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

function StripSkeleton() {
  return (
    <div className={cn(TILE_BAND_CLASS, 'animate-pulse')} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading inbound metrics…</span>
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className={cn(MONITOR_KPI_TILE_CLASS, TILE_CELL_CLASS, 'h-20')}>
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

function pipelineMetrics(summary: IncomingSummary): IncomingMetric[] {
  const metrics: IncomingMetric[] = [];
  if (summary.delivered_unopened > 0) {
    metrics.push({
      id: 'delivered_unopened',
      label: 'Delivered · unscanned',
      value: summary.delivered_unopened,
      intent: 'warn',
      status: 'Scan in',
      tooltip: 'Carrier marked delivered but no dock scan is logged yet. Age bands drive burn-down.',
    });
  }
  if (summary.delivered_unscanned_claims > 0) {
    metrics.push({
      id: 'delivered_unscanned_claims',
      label: 'Claims clock',
      value: summary.delivered_unscanned_claims,
      intent: 'warn',
      status: '>48h',
      tooltip: 'Delivered more than 48 hours ago and still unscanned — claims / OS&D attention.',
    });
  }
  if (summary.awaiting_tracking > 0) {
    metrics.push({
      id: 'awaiting_tracking',
      label: 'Awaiting tracking',
      value: summary.awaiting_tracking,
      intent: 'warn',
      status: 'Attach tracking',
      tooltip: 'Incoming POs with no tracking number registered.',
    });
  }
  metrics.push({
    id: 'issued',
    label: 'Incoming POs',
    value: summary.issued,
    intent: 'neutral',
    tooltip: 'Distinct purchase orders Zoho reports issued but not yet received.',
  });
  metrics.push({
    id: 'arriving_today',
    label: 'Arriving today',
    value: summary.arriving_today,
    intent: summary.arriving_today > 0 ? 'good' : 'neutral',
    tooltip: 'Out for delivery per the carrier.',
  });
  metrics.push({
    id: 'in_transit',
    label: 'In transit',
    value: summary.in_transit,
    intent: 'neutral',
    tooltip: 'Accepted / label-created / in transit with the carrier.',
  });
  if (summary.universal_incoming) {
    metrics.push({
      id: 'ebay_incoming',
      label: 'eBay orders',
      value: summary.ebay_incoming ?? 0,
      intent: (summary.ebay_pending ?? 0) > 0 ? 'warn' : 'neutral',
      status: (summary.ebay_pending ?? 0) > 0 ? `${summary.ebay_pending} need PO link` : undefined,
      tooltip: 'Incoming lines from the eBay purchasing account.',
    });
  }
  return metrics;
}

function triageMetrics(summary: IncomingSummary): IncomingMetric[] {
  const metrics: IncomingMetric[] = [];
  if (summary.delivered_unopened > 0) {
    metrics.push({
      id: 'delivered_unopened',
      label: 'To scan in',
      value: summary.delivered_unopened,
      intent: 'warn',
      status: 'Scan in',
      tooltip: 'Carrier marked delivered but no dock scan is logged yet.',
    });
  }
  if (summary.delivered_unscanned_claims > 0) {
    metrics.push({
      id: 'delivered_unscanned_claims',
      label: 'Claims clock',
      value: summary.delivered_unscanned_claims,
      intent: 'warn',
      status: '>48h',
      tooltip: 'Delivered more than 48 hours ago and still unscanned.',
    });
  }
  if (summary.carrier_mismatch > 0) {
    metrics.push({
      id: 'carrier_mismatch',
      label: 'Carrier mismatch',
      value: summary.carrier_mismatch,
      intent: 'warn',
      status: 'Reconcile',
      tooltip: 'Scanned carrier differs from the tracking number’s carrier.',
    });
  }
  metrics.push({
    id: 'arriving_today',
    label: 'Arriving today',
    value: summary.arriving_today,
    intent: summary.arriving_today > 0 ? 'good' : 'neutral',
    tooltip: 'Out for delivery per the carrier.',
  });
  return metrics;
}

function unboxMetrics(summary: IncomingSummary): IncomingMetric[] {
  const metrics: IncomingMetric[] = [];
  if (summary.delivered_not_unboxed > 0) {
    metrics.push({
      id: 'delivered_not_unboxed',
      label: 'To unbox',
      value: summary.delivered_not_unboxed,
      intent: 'warn',
      status: 'Unbox',
      tooltip: 'Scanned in at the dock but not yet unboxed.',
    });
  }
  metrics.push({
    id: 'issued',
    label: 'Incoming POs',
    value: summary.issued,
    intent: 'neutral',
    tooltip: 'Distinct purchase orders Zoho reports issued but not yet received.',
  });
  metrics.push({
    id: 'arriving_today',
    label: 'Arriving today',
    value: summary.arriving_today,
    intent: summary.arriving_today > 0 ? 'good' : 'neutral',
    tooltip: 'Out for delivery per the carrier.',
  });
  return metrics;
}

function metricsFor(
  summary: IncomingSummary,
  lane: 'pipeline' | 'docked',
  dockedTab: DashboardReceivingTab,
): IncomingMetric[] {
  if (lane === 'pipeline') return pipelineMetrics(summary);
  return dockedTab === 'triage' ? triageMetrics(summary) : unboxMetrics(summary);
}

export function IncomingKpiStrip() {
  const searchParams = useSearchParams();
  const lane = parseInboundLane(searchParams.get('lane'));
  const dockedTab = dashboardReceivingTabFromSort(searchParams.get('sort'));
  const summary = useIncomingSummary();

  if (!summary) return <StripSkeleton />;

  const metrics = metricsFor(summary, lane, dockedTab);
  const aria =
    lane === 'pipeline'
      ? 'Pipeline attention'
      : `${dockedTab === 'triage' ? 'Triage' : 'Unbox'} attention`;

  return (
    <section aria-label={aria} className="shrink-0">
      <div className={TILE_BAND_CLASS}>
        {metrics.map((metric) => (
          <div key={metric.id} className={TILE_CELL_CLASS}>
            <MetricKpiTile metric={metric} />
          </div>
        ))}
      </div>
    </section>
  );
}
