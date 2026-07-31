'use client';

/**
 * Dashboard · Receiving — the per-tab KPI band, between the workbench chrome and
 * the lines table. Composes the same golden `KpiTile` band as `IncomingKpiStrip`
 * and reads the same 30s-polled `useIncomingSummary` aggregate, so counts never
 * drift from the sidebar/incoming tiles.
 *
 * Each tab surfaces its OWN attention set:
 *   • Triage (scanned order) — the scan/identify backlog: delivered-but-unopened,
 *     awaiting tracking, carrier mismatches, arriving today.
 *   • Unbox (unboxed order)  — the unbox backlog: delivered-not-unboxed, the
 *     incoming-PO pipeline, in transit.
 */

import {
  KpiTile,
  metricIntentTextClass,
  MONITOR_KPI_TILE_CLASS,
  type MetricIntent,
} from '@/design-system/components/monitor';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useIncomingSummary } from '@/components/sidebar/receiving/incoming/useIncomingSummary';
import type { IncomingSummary } from '@/components/sidebar/receiving/incoming/incoming-summary-types';
import { cn } from '@/utils/_cn';
import type { DashboardReceivingTab } from './dashboard-receiving-tabs';

const TILE_BAND_CLASS = 'flex flex-wrap gap-3';
const TILE_CELL_CLASS = 'min-w-0 grow basis-40';

interface ReceivingMetric {
  id: string;
  label: string;
  value: number;
  intent: MetricIntent;
  /** Action hint — kept for metrics data; painted via tooltip, not a tile footer. */
  status?: string;
  tooltip?: string;
}

function MetricKpiTile({ metric }: { metric: ReceivingMetric }) {
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
      <span className="sr-only">Loading receiving metrics…</span>
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

function triageMetrics(summary: IncomingSummary): ReceivingMetric[] {
  const metrics: ReceivingMetric[] = [];
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

function unboxMetrics(summary: IncomingSummary): ReceivingMetric[] {
  const metrics: ReceivingMetric[] = [];
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
    id: 'in_transit',
    label: 'In transit',
    value: summary.in_transit,
    intent: 'neutral',
    tooltip: 'Accepted / label-created / in transit with the carrier.',
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

export function DashboardReceivingKpiStrip({ tab }: { tab: DashboardReceivingTab }) {
  const summary = useIncomingSummary();
  if (!summary) return <StripSkeleton />;

  const metrics = tab === 'triage' ? triageMetrics(summary) : unboxMetrics(summary);

  return (
    <section aria-label={`${tab === 'triage' ? 'Triage' : 'Unbox'} attention`} className="shrink-0">
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
