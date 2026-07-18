'use client';

/**
 * FBA board KPI strip — Monitor tiles over the loaded board slice on
 * `/outbound?mode=fba`. Same tile anatomy as `ShippingKpiStrip` /
 * `OutboundKpiStrip`; counts + tones resolve through the
 * {@link resolveFbaBoardMetrics} SoT, never inline maps. Tiles that map to a
 * board status facet click-to-toggle the filter (house Monitor-filter
 * affordance: bg + inset ring, never a size shift).
 */

import { useMemo } from 'react';
import { KpiTile, metricIntentTextClass } from '@/design-system/components/monitor';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  resolveFbaBoardMetrics,
  type FbaBoardMetric,
  type FbaBoardStageCounts,
  type FbaBoardStatusFilter,
} from '@/lib/fba/fba-metrics';

const TILE_BAND_CLASS = 'flex flex-wrap gap-3';
const TILE_CELL_CLASS = 'min-w-0 grow basis-32';

interface FbaKpiStripProps {
  counts: FbaBoardStageCounts;
  activeFilter: FbaBoardStatusFilter;
  /** Toggle a status facet; passing the active one (or `ALL`) clears it. */
  onToggleFilter: (filter: FbaBoardStatusFilter) => void;
}

function MetricTileCell({
  metric,
  activeFilter,
  onToggleFilter,
}: {
  metric: FbaBoardMetric;
  activeFilter: FbaBoardStatusFilter;
  onToggleFilter: (filter: FbaBoardStatusFilter) => void;
}) {
  const toneHero = metric.intent === 'warn' || metric.intent === 'bad';
  const clickable = Boolean(metric.filterStatus);
  const active = Boolean(
    metric.filterStatus && metric.filterStatus !== 'ALL' && activeFilter === metric.filterStatus,
  );

  const tile = (
    <KpiTile
      label={metric.label}
      value={metric.value}
      valueClassName={toneHero ? metricIntentTextClass(metric.intent) : undefined}
      active={active}
      onOpen={
        clickable ? () => onToggleFilter(metric.filterStatus as FbaBoardStatusFilter) : undefined
      }
      className="h-full"
    />
  );

  return (
    <div className={TILE_CELL_CLASS}>
      {metric.tooltip ? (
        <HoverTooltip label={metric.tooltip} focusable={!clickable} className="block h-full">
          {tile}
        </HoverTooltip>
      ) : (
        tile
      )}
    </div>
  );
}

export function FbaKpiStrip({ counts, activeFilter, onToggleFilter }: FbaKpiStripProps) {
  const metrics = useMemo(() => resolveFbaBoardMetrics(counts), [counts]);

  return (
    <div className={TILE_BAND_CLASS}>
      {metrics.map((metric) => (
        <MetricTileCell
          key={metric.id}
          metric={metric}
          activeFilter={activeFilter}
          onToggleFilter={onToggleFilter}
        />
      ))}
    </div>
  );
}
