'use client';

/**
 * Incoming attention strip — the golden KPI band (sibling of `TestingKpiStrip`)
 * that sits between the workbench chrome tabs and the incoming list. Reads the
 * same 30s-polled `useIncomingSummary` aggregate the sidebar tiles use, so the
 * counts never drift from the facet chips.
 *
 * Tiles lead with what needs a human — delivered-but-unopened, awaiting
 * tracking — then the steady-state pipeline counts. The eBay tile appears only
 * when the org has the eBay purchasing account wired in (Universal Incoming).
 */

import {
  KpiTile,
  metricIntentTextClass,
  MONITOR_KPI_TILE_CLASS,
  type MetricIntent,
} from '@/design-system/components/monitor';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useIncomingSummary } from './useIncomingSummary';
import { cn } from '@/utils/_cn';

const TILE_BAND_CLASS = 'flex flex-wrap gap-3';
const TILE_CELL_CLASS = 'min-w-0 grow basis-40';

interface IncomingMetric {
  id: string;
  label: string;
  value: number;
  intent: MetricIntent;
  /** Action hint — kept for metrics data; painted via tooltip, not a tile footer. */
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
      <span className="sr-only">Loading incoming metrics…</span>
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

export function IncomingKpiStrip() {
  const summary = useIncomingSummary();

  if (!summary) return <StripSkeleton />;

  const metrics: IncomingMetric[] = [];

  // Attention-first: what a human needs to act on now.
  if (summary.delivered_unopened > 0) {
    metrics.push({
      id: 'delivered_unopened',
      label: 'Delivered · unopened',
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

  // Steady-state pipeline.
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

  // eBay purchasing source — only once the account is connected.
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

  return (
    <section aria-label="Incoming attention" className="shrink-0">
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
