/** View-monitor VALUE resolution — turn a monitor's snapshotted view into the number the evaluator compares against a threshold. */

import { resolveFulfillmentLane, type FulfillmentLane } from '@/lib/order-lifecycle';
import type { ThresholdType } from './evaluate';

/** The value-relevant projection of a monitor row. */
export interface MonitorValueInput {
  /** A `saved_views.surface` string (Phase 1: `dashboard_unshipped`). */
  readonly monitorSurface: string;
  /** The snapshot bag: `{ query?: '<urlencoded view params>', agingHours?: number }`. */
  readonly monitorParams: unknown;
  readonly thresholdType: ThresholdType;
}

/**
 * The pre-computed To-ship counts — the SAME shape `/api/orders/queue-counts`
 * reports. The deps binding runs the one grouped aggregate that produces it.
 */
export interface OutboundQueueCounts {
  readonly total: number;
  /** Coarse `has_tech_scan` split: `pending = total − tested` (double-counts blocked). */
  readonly byStage: { readonly pending: number; readonly tested: number };
  /** `orders.is_urgent` tally over the same scope. */
  readonly urgent: number;
  /** Raw facts; lane-accurate tallies derive from these via resolveFulfillmentLane. */
  readonly combos: ReadonlyArray<{
    readonly hasTechScan: boolean;
    readonly blocked: boolean;
    readonly count: number;
  }>;
  /** Ready-to-Pack placement (DESK/STAGING open packages), org-wide. */
  readonly packPlacement: {
    readonly totalPlaced: number;
    readonly counts: ReadonlyArray<{ readonly locationId: number; readonly count: number }>;
  };
}

/** A bounded fallback COUNT(*) request for a facet the aggregate can't express. */
export interface BoundedUnshippedCountSpec {
  readonly staffId?: number;
  /** Exact fulfillment lane (`ustatus`). */
  readonly lane?: FulfillmentLane;
  /** Coarse `stage` facet when no exact lane was chosen. */
  readonly coarseStage?: 'pending' | 'tested';
  readonly urgentOnly?: boolean;
  readonly packPlaced?: boolean;
  readonly packStationId?: number;
  /** item_aging: only rows whose age exceeds this many ms (deadline_at ?? created_at). */
  readonly agingOlderThanMs?: number;
}

export interface ResolveValueDeps {
  /** The pre-computed To-ship counts, optionally narrowed to one staffer. */
  outboundQueueCounts(opts: { staffId?: number; needsPlacement?: boolean }): Promise<OutboundQueueCounts>;
  /** One bounded COUNT(*) over the pre-pack membership for a custom combo. */
  boundedUnshippedCount(spec: BoundedUnshippedCountSpec): Promise<number>;
}

/** The recognized To-ship facet selection parsed off the snapshot. */
interface UnshippedFacets {
  staffId?: number;
  lane?: FulfillmentLane;
  coarseStage?: 'pending' | 'tested';
  urgentOnly: boolean;
  packPlaced: boolean;
  packStationId?: number;
}

const SUPPORTED_SURFACE = 'dashboard_unshipped';

function isTruthyParam(v: string | null): boolean {
  return v === '1' || v === 'true';
}

/** Coerce the snapshot bag into the view's URL params. Tolerates junk. */
function parseMonitorParams(monitorParams: unknown): URLSearchParams {
  if (monitorParams && typeof monitorParams === 'object') {
    const bag = monitorParams as Record<string, unknown>;
    if (typeof bag.query === 'string') return new URLSearchParams(bag.query);
    // A plain flat object of scalar params is also accepted.
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(bag)) {
      if (v != null && typeof v !== 'object') sp.set(k, String(v));
    }
    return sp;
  }
  return new URLSearchParams();
}

function extractUnshippedFacets(p: URLSearchParams): UnshippedFacets {
  const ustatus = (p.get('ustatus') ?? '').toUpperCase();
  const lane =
    ustatus === 'PENDING' || ustatus === 'TESTED' || ustatus === 'BLOCKED'
      ? (ustatus as FulfillmentLane)
      : undefined;
  const stageRaw = (p.get('stage') ?? '').toLowerCase();
  // `ustatus` (exact lane) wins over the coarse `stage` — the board clears
  // `stage` when `ustatus` is set (outbound-sidebar), so they never truly co-occur.
  const coarseStage =
    !lane && (stageRaw === 'pending' || stageRaw === 'tested') ? (stageRaw as 'pending' | 'tested') : undefined;
  const staffRaw = Number(p.get('staff'));
  const staffId = Number.isFinite(staffRaw) && staffRaw > 0 ? staffRaw : undefined;
  const stationRaw = Number(p.get('packStation'));
  const packStationId = Number.isFinite(stationRaw) && stationRaw > 0 ? stationRaw : undefined;
  // `late` is deliberately ignored: it is a snapshotted param key with no wired
  // row-filter on the To-ship grid today, so honoring it would diverge from the
  // rows the board actually shows.
  return {
    staffId,
    lane,
    coarseStage,
    urgentOnly: isTruthyParam(p.get('attention')),
    packPlaced: isTruthyParam(p.get('packPlaced')),
    packStationId,
  };
}

/** How many orthogonal filter GROUPS are active (lane | urgent | placement). */
function activeFacetGroups(f: UnshippedFacets): number {
  return (
    (f.lane || f.coarseStage ? 1 : 0) +
    (f.urgentOnly ? 1 : 0) +
    (f.packPlaced || f.packStationId != null ? 1 : 0)
  );
}

/**
 * True when the facet is a SINGLE selection the pre-computed aggregate carries.
 * A placement facet narrowed by staff is NOT in the aggregate (placement is
 * org-wide there), so it falls back.
 */
function isBundleExpressible(f: UnshippedFacets): boolean {
  if (activeFacetGroups(f) > 1) return false;
  const isPlacement = f.packPlaced || f.packStationId != null;
  return !(isPlacement && f.staffId != null);
}

function laneCount(counts: OutboundQueueCounts, lane: FulfillmentLane): number {
  return counts.combos
    .filter((c) => resolveFulfillmentLane({ isOutOfStock: c.blocked, hasTechScan: c.hasTechScan }) === lane)
    .reduce((sum, c) => sum + c.count, 0);
}

function selectBundleValue(counts: OutboundQueueCounts, f: UnshippedFacets): number {
  if (f.lane) return laneCount(counts, f.lane);
  if (f.coarseStage === 'pending') return counts.byStage.pending;
  if (f.coarseStage === 'tested') return counts.byStage.tested;
  if (f.urgentOnly) return counts.urgent;
  if (f.packStationId != null) {
    return counts.packPlacement.counts.find((c) => c.locationId === f.packStationId)?.count ?? 0;
  }
  if (f.packPlaced) return counts.packPlacement.totalPlaced;
  return counts.total;
}

function toSpec(f: UnshippedFacets): BoundedUnshippedCountSpec {
  return {
    staffId: f.staffId,
    lane: f.lane,
    coarseStage: f.coarseStage,
    urgentOnly: f.urgentOnly || undefined,
    packPlaced: f.packPlaced || undefined,
    packStationId: f.packStationId,
  };
}

/** Read the item_aging age bound (hours) from the snapshot bag → ms. */
function agingOlderThanMs(monitorParams: unknown): number {
  const bag = monitorParams && typeof monitorParams === 'object' ? (monitorParams as Record<string, unknown>) : {};
  const hours = Number(bag.agingHours);
  if (!Number.isFinite(hours) || hours < 0) {
    throw new Error('resolveMonitorValue: item_aging requires a non-negative monitorParams.agingHours');
  }
  return hours * 3_600_000;
}

/**
 * Resolve the monitor's current numeric value.
 *
 * @throws for an unsupported surface, or an item_aging monitor missing its age bound.
 */
export async function resolveMonitorValue(
  input: MonitorValueInput,
  deps: ResolveValueDeps,
): Promise<number> {
  if (input.monitorSurface !== SUPPORTED_SURFACE) {
    throw new Error(
      `resolveMonitorValue: unsupported surface "${input.monitorSurface}" — Phase 1 resolves ${SUPPORTED_SURFACE} only.`,
    );
  }
  const facets = extractUnshippedFacets(parseMonitorParams(input.monitorParams));

  // item_aging is a count of membership rows older than T — never in the
  // pre-computed aggregate, so always the bounded fallback.
  if (input.thresholdType === 'item_aging') {
    return deps.boundedUnshippedCount({ ...toSpec(facets), agingOlderThanMs: agingOlderThanMs(input.monitorParams) });
  }

  // count_above / count_below: read the mapped facet off the pre-computed
  // aggregate when it's a single selection; otherwise one bounded count.
  if (!isBundleExpressible(facets)) {
    return deps.boundedUnshippedCount(toSpec(facets));
  }
  const needsPlacement = facets.packPlaced || facets.packStationId != null;
  const counts = await deps.outboundQueueCounts({ staffId: facets.staffId, needsPlacement });
  return selectBundleValue(counts, facets);
}
