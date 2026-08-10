'use client';

/**
 * Shipping workspace attention strip — Monitor KPIs for Pending / History
 * on `/test` Shipping mode. Same tile anatomy as OutboundKpiStrip.
 *
 * Pending tiles that map to a fulfillment lane click-to-toggle `?ustatus` via
 * {@link useToShipStatusFilter} — the same param the toolbar exact filters use —
 * so the board under the strip collapses to that lane.
 *
 * Packing-station tiles (DESK / STAGING) arm the Ready-to-Pack place target and
 * set `?packStation=` — placement facets, not lifecycle tabs.
 */

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import { packPlacementQuery } from '@/lib/queries/pack-placement-queries';
import { unitPackPlacementQuery } from '@/lib/queries/unit-pack-placement-queries';
import { KpiTile, metricIntentTextClass, OpsKpiBand, OpsKpiBandCell, OpsKpiBandEmpty, OpsKpiBandError, OpsKpiBandSkeletonTile } from '@/design-system/components/monitor';
import {
  resolveShippingMetrics,
  splitShippingAttention,
  ZERO_SHIPPING_HISTORY,
  type ComputedMetric,
  type ShippingHistoryCounts,
} from '@/lib/tech/shipping-metrics';
import type { ShippingWorkspaceTab } from '@/utils/shipping-workspace-state';
import { useToShipStatusFilter } from '@/components/unshipped/useToShipStatusFilter';
import { useGatedOperationsRoi } from '@/features/operations/workspace/useGatedOperationsRoi';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useTechLogs, type TechRecord } from '@/hooks/useTechLogs';
import { STAFF_FILTER_PARAM, useStaffFilter } from '@/hooks/useStaffFilter';
import { computeWeekRange, toPSTDateKey } from '@/utils/date';
import type { FulfillmentState } from '@/lib/unshipped-state';
import { useArmedPackStation } from '@/hooks/useArmedPackStation';
import type { PackPlacementCountRow } from '@/lib/packing/pack-placement';
import { packBenchShortLabel } from '@/lib/packing/pack-bench-display';
import { PackBenchChipRow } from '@/components/packing/PackBenchChipRow';

const EMPTY_UNSHIPPED = { total: 0, pending: 0, tested: 0, blocked: 0 };

type ToShipFilter = { active: FulfillmentState | null; toggle: (state: FulfillmentState) => void };

const stationShortLabel = (row: PackPlacementCountRow) => packBenchShortLabel(row);

function MetricKpiTile({
  metric,
  toShipFilter,
  onStationOpen,
  stationActive,
}: {
  metric: ComputedMetric;
  toShipFilter?: ToShipFilter;
  onStationOpen?: () => void;
  stationActive?: boolean;
}) {
  const tone = metricIntentTextClass(metric.intent);
  const toneHero = metric.intent === 'warn' || metric.intent === 'bad';
  const isStation = metric.id.startsWith('pack-station-');
  const clickable = isStation
    ? Boolean(onStationOpen)
    : Boolean(metric.filterUstatus && toShipFilter);
  const active = isStation
    ? Boolean(stationActive)
    : Boolean(metric.filterUstatus && toShipFilter?.active === metric.filterUstatus);

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
        isStation
          ? onStationOpen
          : clickable
            ? () => toShipFilter?.toggle(metric.filterUstatus as FulfillmentState)
            : undefined
      }
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

function StripSkeleton({ reservedSlots }: { reservedSlots: number }) {
  return (
    <OpsKpiBand density="band" className="animate-pulse" aria-label="Loading shipping attention metrics">
      <span className="sr-only">Loading shipping attention metrics…</span>
      {Array.from({ length: reservedSlots }).map((_, i) => (
        <OpsKpiBandCell key={i} density="band">
          <OpsKpiBandSkeletonTile density="band" />
        </OpsKpiBandCell>
      ))}
    </OpsKpiBand>
  );
}

function StripAllClear({ mode }: { mode: ShippingWorkspaceTab }) {
  const copy =
    mode === 'pending' || mode === 'urgent' || mode === 'all'
      ? {
          title:
            mode === 'urgent'
              ? 'No urgent orders.'
              : mode === 'all'
                ? 'Nothing to triage.'
                : 'The queue is clear.',
          hint: 'Blocked units, backlog, and week throughput surface here.',
        }
      : { title: 'No scan-outs in view.', hint: 'Today and week throughput surface here.' };
  return <OpsKpiBandEmpty density="band" title={copy.title} description={copy.hint} />;
}

function StripError({ onRetry }: { onRetry: () => void }) {
  return (
    <OpsKpiBandError
      density="band"
      message="Couldn't load shipping metrics."
      onRetry={onRetry}
    />
  );
}

function summarizeHistory(records: TechRecord[]): ShippingHistoryCounts {
  const todayKey = toPSTDateKey(new Date());
  let todayTotal = 0;
  let awaitingShip = 0;
  for (const r of records) {
    try {
      if (toPSTDateKey(r.created_at) === todayKey) todayTotal += 1;
    } catch {
      /* ignore bad dates */
    }
    if (!r.is_shipped) awaitingShip += 1;
  }
  return {
    weekTotal: records.length,
    todayTotal,
    awaitingShip,
  };
}

function StripLayout({
  mode,
  metrics,
  isPending,
  isError,
  reservedSlots,
  onRetry,
  toShipFilter,
  armedLocationId,
  onArmStation,
}: {
  mode: ShippingWorkspaceTab;
  metrics: ComputedMetric[];
  isPending: boolean;
  isError: boolean;
  reservedSlots: number;
  onRetry: () => void;
  toShipFilter?: ToShipFilter;
  armedLocationId?: number | null;
  onArmStation?: (metric: ComputedMetric) => void;
}) {
  if (isError) return <StripError onRetry={onRetry} />;
  if (isPending) return <StripSkeleton reservedSlots={reservedSlots} />;
  const { attention, rest } = splitShippingAttention(metrics);
  const tiles = [...attention, ...rest];
  if (tiles.length === 0) return <StripAllClear mode={mode} />;
  return (
    <OpsKpiBand density="band" aria-label="Ready to Pack attention metrics">
      {tiles.map((metric) => {
        const stationId = metric.id.startsWith('pack-station-')
          ? Number(metric.id.replace('pack-station-', ''))
          : null;
        return (
          <OpsKpiBandCell key={metric.id} density="band">
            <MetricKpiTile
              metric={metric}
              toShipFilter={toShipFilter}
              stationActive={
                stationId != null && armedLocationId != null && stationId === armedLocationId
              }
              onStationOpen={
                stationId != null && onArmStation ? () => onArmStation(metric) : undefined
              }
            />
          </OpsKpiBandCell>
        );
      })}
    </OpsKpiBand>
  );
}

/**
 * Per-bench LOOSE-UNIT count — a compact secondary strip under the order KPI
 * tiles on Ready-to-Pack (P3b). Orders and units keep SEPARATE ledgers + counts,
 * so this never merges into an order tile's number: it answers "how many loose
 * units are staged at each bench" alongside the order tiles' "how many orders".
 * Fed by the same {@link unitPackPlacementQuery} the armed-bench chip reads, so
 * it costs no extra fetch. Every bench renders (spatial predictability) — muted
 * at zero so the row stays quiet on the common empty case.
 */
function UnitBenchStrip() {
  const query = useQuery(unitPackPlacementQuery());
  const counts = query.data?.counts ?? [];
  if (query.isPending || query.isError) return null;
  return (
    <PackBenchChipRow
      label="Units staged"
      rows={counts}
      testId="unit-bench"
      itemNoun="unit"
    />
  );
}

function PendingStrip() {
  const query = useQuery(unshippedQueueCountsQuery());
  const placementQuery = useQuery(packPlacementQuery());
  const { roi, pending: roiPending } = useGatedOperationsRoi();
  const toShipFilter = useToShipStatusFilter();
  const { armed, arm } = useArmedPackStation();
  const data = query.data;
  const unshipped = {
    total: data?.total ?? 0,
    pending: data?.byStage.pending ?? 0,
    tested: data?.byStage.tested ?? 0,
    blocked: (data?.combos ?? []).reduce((s, c) => s + (c.blocked ? c.count : 0), 0),
  };
  const lifecycleMetrics = resolveShippingMetrics({
    mode: 'pending',
    unshipped,
    history: ZERO_SHIPPING_HISTORY,
    roi,
  });
  const stationMetrics: ComputedMetric[] = useMemo(() => {
    const counts = placementQuery.data?.counts ?? [];
    return counts.map((row) => {
      const label = stationShortLabel(row);
      return {
        id: `pack-station-${row.locationId}`,
        label,
        value: row.count.toLocaleString(),
        fraction: unshipped.tested > 0 ? Math.min(1, row.count / unshipped.tested) : 0,
        intent: row.locationKind === 'STAGING' ? ('warn' as const) : ('neutral' as const),
        severity: row.locationKind === 'STAGING' ? 2 : 1,
        status: row.locationKind === 'STAGING' ? 'Staging' : 'Bench',
        tooltip: `${row.locationName}: ${row.count} package${row.count === 1 ? '' : 's'}. Click to arm and filter.`,
      };
    });
  }, [placementQuery.data?.counts, unshipped.tested]);
  const metrics = [...lifecycleMetrics, ...stationMetrics];
  return (
    <>
      <StripLayout
        mode="pending"
        metrics={metrics}
        isPending={query.isPending || roiPending || placementQuery.isPending}
        isError={query.isError}
        reservedSlots={4}
        toShipFilter={toShipFilter}
        armedLocationId={armed?.locationId ?? null}
        onArmStation={(metric) => {
          const locationId = Number(metric.id.replace('pack-station-', ''));
          const row = (placementQuery.data?.counts ?? []).find((c) => c.locationId === locationId);
          if (!row) return;
          if (armed?.locationId === locationId) {
            arm(null);
            return;
          }
          arm({
            locationId: row.locationId,
            name: row.locationName,
            barcode: row.locationBarcode,
            locationKind: row.locationKind,
          });
        }}
        onRetry={() => {
          void query.refetch();
          void placementQuery.refetch();
        }}
      />
      <UnitBenchStrip />
    </>
  );
}

function HistoryStrip({ techId }: { techId?: number }) {
  const { staffId } = useStaffFilter({ allToken: 'all' });
  const searchParams = useSearchParams();
  const wantAll = String(searchParams.get(STAFF_FILTER_PARAM) || '').toLowerCase() === 'all';
  const weekRange = useMemo(() => computeWeekRange(0), []);
  const ownId = techId != null && techId > 0 ? techId : null;
  const techScope = wantAll ? 'all' : (staffId ?? ownId ?? 'all');
  const query = useTechLogs(techScope, { weekOffset: 0, weekRange });
  const history = useMemo(
    () => summarizeHistory(Array.isArray(query.data) ? query.data : []),
    [query.data],
  );
  const metrics = resolveShippingMetrics({
    mode: 'history',
    unshipped: EMPTY_UNSHIPPED,
    history,
    roi: null,
  });
  return (
    <StripLayout
      mode="history"
      metrics={metrics}
      isPending={query.isPending}
      isError={query.isError}
      reservedSlots={2}
      onRetry={() => {
        void query.refetch();
      }}
    />
  );
}

export function ShippingKpiStrip({
  mode,
  techId,
}: {
  mode: ShippingWorkspaceTab;
  /** Signed-in tech — History strip defaults to this staff when `?staff=` is absent. */
  techId?: number;
}) {
  return (
    <section aria-label="Ready to Pack attention" className="shrink-0">
      {mode === 'history' ? (
        <HistoryStrip techId={techId} />
      ) : (
        <PendingStrip />
      )}
    </section>
  );
}
