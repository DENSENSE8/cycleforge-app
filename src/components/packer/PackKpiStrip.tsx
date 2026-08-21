'use client';

/**
 * Pack workspace attention strip — Ready-to-pack (TESTED) + backlog tiles on
 * Queue; packed-today on History. Reuses shipping-metrics + queue-counts SoT.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import { packerCountsQuery } from '@/lib/queries/station-table-queries';
import { KpiTile, metricIntentTextClass, OpsKpiBand, OpsKpiBandCell, OpsKpiBandEmpty, OpsKpiBandError, OpsKpiBandSkeletonTile } from '@/design-system/components/monitor';
import {
  resolveShippingMetrics,
  splitShippingAttention,
  ZERO_SHIPPING_HISTORY,
  type ComputedMetric,
} from '@/lib/tech/shipping-metrics';
import type { PackWorkspaceTab } from '@/utils/pack-workspace-state';
import { useToShipStatusFilter } from '@/components/unshipped/useToShipStatusFilter';
import { useGatedOperationsRoi } from '@/features/operations/workspace/useGatedOperationsRoi';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { computeWeekRange, getCurrentPSTDateKey } from '@/utils/date';
import { useStaffFilter } from '@/hooks/useStaffFilter';
import type { FulfillmentState } from '@/lib/unshipped-state';

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
      labelClassName={clickable ? 'normal-case tracking-normal' : undefined}
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
    <OpsKpiBand density="band" className="animate-pulse" aria-label="Loading packing attention metrics">
      <span className="sr-only">Loading packing attention metrics…</span>
      {Array.from({ length: reservedSlots }).map((_, i) => (
        <OpsKpiBandCell key={i} density="band">
          <OpsKpiBandSkeletonTile density="band" />
        </OpsKpiBandCell>
      ))}
    </OpsKpiBand>
  );
}

/**
 * Queue-only all-clear. History does NOT use this: an empty history week shows
 * its KPI tiles at zero and lets the table own the empty statement, so the
 * surface never prints "no packs" twice.
 */
function StripAllClear() {
  return (
    <OpsKpiBandEmpty
      density="band"
      title="Nothing ready to pack."
      description="Orders land here after the tech scan (TESTED)."
    />
  );
}

function StripError({ onRetry }: { onRetry: () => void }) {
  return (
    <OpsKpiBandError density="band" message="Could not load packing metrics." onRetry={onRetry} />
  );
}

function QueueStrip() {
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
  const { attention, rest } = splitShippingAttention(metrics);
  const tiles = [...attention, ...rest];

  if (query.isError) {
    return <StripError onRetry={() => void query.refetch()} />;
  }
  if (query.isPending || roiPending) {
    return <StripSkeleton reservedSlots={4} />;
  }
  if (tiles.length === 0) return <StripAllClear />;

  return (
    <OpsKpiBand density="band" aria-label="Packing attention metrics">
      {tiles.map((metric) => (
        <OpsKpiBandCell key={metric.id} density="band">
          <MetricKpiTile metric={metric} toShipFilter={toShipFilter} />
        </OpsKpiBandCell>
      ))}
    </OpsKpiBand>
  );
}

function HistoryStrip({ packerId }: { packerId: number }) {
  const { staffId } = useStaffFilter({ allToken: 'all' });
  const weekRange = useMemo(() => computeWeekRange(0), []);
  const scopeId = staffId ?? (packerId > 0 ? packerId : undefined);
  const query = useQuery(
    packerCountsQuery({
      weekStart: weekRange.startStr,
      weekEnd: weekRange.endStr,
      packedBy: scopeId ?? null,
    }),
  );

  const todayKey = getCurrentPSTDateKey();
  const packedToday = useMemo(() => {
    const byDay = query.data?.byDay ?? {};
    if (typeof byDay[todayKey] === 'number') return byDay[todayKey];
    return 0;
  }, [query.data?.byDay, todayKey]);

  if (query.isError) {
    return <StripError onRetry={() => void query.refetch()} />;
  }
  if (query.isPending) {
    return <StripSkeleton reservedSlots={2} />;
  }

  const weekTotal = Number(query.data?.total ?? 0);
  // A zero week renders the tiles AT ZERO rather than swapping in an empty-state
  // banner: "Packed today 0 / This week 0" is the metric, the strip keeps a
  // stable shape, and the history table below already owns the one "no packs
  // this week" statement. Two components saying it was the duplicate empty.

  return (
    <OpsKpiBand density="band" aria-label="Packing history metrics">
      <OpsKpiBandCell density="band">
        <KpiTile density="band" label="Packed today" value={packedToday.toLocaleString()} className="h-full" />
      </OpsKpiBandCell>
      <OpsKpiBandCell density="band">
        <KpiTile density="band" label="This week" value={weekTotal.toLocaleString()} className="h-full" />
      </OpsKpiBandCell>
    </OpsKpiBand>
  );
}

export function PackKpiStrip({
  mode,
  packerId,
}: {
  mode: PackWorkspaceTab;
  packerId: number;
}) {
  return (
    <section aria-label="Packing attention" className="shrink-0">
      {mode === 'queue' ? <QueueStrip /> : <HistoryStrip packerId={packerId} />}
    </section>
  );
}
