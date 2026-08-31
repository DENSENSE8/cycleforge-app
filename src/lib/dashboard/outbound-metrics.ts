/**
 * Outbound KPI registry — the single declarative index of every metric the
 * dashboard's Outbound overview can show. Each entry is a pure descriptor:
 * `{ id, label, modes, compute(ctx) }`. `compute` returns a `ComputedMetric` when
 * the data is populated, or **null to drop the tile** (the "no zeros" rule —
 * deadline / dock-scan / labor columns are null-heavy).
 *
 * To add or change a KPI, edit ONE entry here — the strip renders whatever this
 * array yields, and every tile gets a gauge + good/bad status for free via
 * `MetricTile`. No component edits, no scattered tile-builder branches.
 *
 * Pure + isomorphic (no React, no fetch): unit-testable in isolation.
 */

import type { MetricIntent } from '@/design-system/components/monitor';
import type { OperationsRoiData } from '@/features/operations/workspace/useOperationsRoi';
import type { OutboundState } from '@/lib/outbound-state';
import type { FulfillmentState } from '@/lib/unshipped-state';

export type OutboundMode = 'shipped' | 'unshipped';

/**
 * Shipped-side fulfillment rollups, derived once from the week fetch (by
 * `useShippedScanOutData`). Kept here — the pure domain module — so the registry
 * and its tests never pull the React hook. Every `*Coverage` is the non-null
 * denominator for its rate (deadline / dock-scan columns are null-heavy).
 */
export interface OutboundMetrics {
  shipped: number;
  delivered: number;
  inTransit: number;
  staged: number;
  scannedOut: number;
  exceptions: number;
  orphans: number;
  /** hasLeft = scanned-out OR carrier custody. */
  leftCount: number;
  /** On-time = effShipTime ≤ deadline_at, over rows that HAVE a deadline. */
  onTime: number;
  onTimeCoverage: number;
  /** Median pack→dock staging hours, over rows with a SHIP_CONFIRM scan. */
  dwellMedianHours: number | null;
  dwellCoverage: number;
  /** Avg age (h) of packages still staged at the dock (awaiting scan-out). */
  stagedAvgAgeHours: number | null;
}

export const ZERO_OUTBOUND_METRICS: OutboundMetrics = {
  shipped: 0,
  delivered: 0,
  inTransit: 0,
  staged: 0,
  scannedOut: 0,
  exceptions: 0,
  orphans: 0,
  leftCount: 0,
  onTime: 0,
  onTimeCoverage: 0,
  dwellMedianHours: null,
  dwellCoverage: 0,
  stagedAvgAgeHours: null,
};

/** Everything a metric may read — assembled once by the strip from its hooks. */
export interface OutboundMetricCtx {
  mode: OutboundMode;
  /** Denominator for share-of-total gauges. */
  total: number;
  /** Shipped-side rollups (from `useShippedScanOutData`). */
  shipped: OutboundMetrics;
  /** Unshipped queue tallies. */
  unshipped: {
    total: number;
    pending: number;
    tested: number;
    blocked: number;
    /** Operator-flagged expedited rows (`orders.is_urgent`). */
    urgent: number;
    /** Ship-by today or past (PST) — Must-ship facet. */
    mustShip?: number;
    /** Open ready-to-pack packages currently at a packing DESK/STAGING. */
    atStations?: number;
  };
  /** Org throughput ROI (null when ungated / no data). */
  roi: OperationsRoiData | null;
}

/** A metric resolved for render — consumed 1:1 by the attention strip. */
export interface ComputedMetric {
  id: string;
  label: string;
  value: string;
  /** 0..1 gauge fill. Retained for legacy gauge consumers; the attention strip
   *  ignores it (a fill is a decorative claim — see the OutboundKpiStrip redesign). */
  fraction: number;
  intent: MetricIntent;
  status?: string;
  delta?: number;
  deltaInvert?: boolean;
  /**
   * Attention rank — how loudly this wants a human RIGHT NOW. `0` = not an
   * attention item (pure status/trend; the strip shows it only if it carries an
   * honest week-over-week `delta`, else drops it). `1` = focus/pressure (a
   * backlog to work down), `2` = warn, `3` = critical (check immediately). The
   * strip sorts the attention zone by this descending, so the most urgent fact
   * sits leftmost — reading order = priority.
   */
  severity: number;
  /** One-line HoverTooltip definition (with numerator/denominator where it clarifies). */
  tooltip?: string;
  /**
   * When set, the tile is a Monitor filter: clicking it toggles the shipped board's
   * `?ostatus` to this outbound state (via `useOutboundStatusFilter`). Level metrics
   * that map to a real derived state get this; rate/trend metrics (packed, on-time)
   * have no honest state filter, so they stay tooltip-only.
   */
  filterState?: OutboundState;
  /**
   * When set, the tile toggles the To Ship / Shipping Pending board's `?ustatus`
   * URL facet (row narrowing — never a column swap). Maps ready → TESTED, pending → PENDING,
   * blocked → BLOCKED (Out of stock). Mutually exclusive with {@link filterState}
   * and {@link filterAttention}.
   */
  filterUstatus?: FulfillmentState;
  /**
   * When set, the tile toggles Urgent-only (`?attention=1` / `orders.is_urgent`).
   * Mutually exclusive with {@link filterState} and {@link filterUstatus}.
   */
  filterAttention?: boolean;
  /**
   * When set, the tile toggles Must-ship (`?late=1` — ship-by today or past, PST).
   * Same facet as Band-1 Must ship. Mutually exclusive with the other To-ship filters.
   */
  filterLate?: boolean;
  /**
   * When set, the tile toggles packing-station placement filter (`?packPlaced=1`).
   * Mutually exclusive with lifecycle filters.
   */
  filterPackPlaced?: boolean;
}

/** Pinned left queue cluster on the unshipped strip — fixed display order. */
const OUTBOUND_QUEUE_ZONE_IDS = ['pending', 'mustShip', 'urgent', 'blocked'] as const;

export interface OutboundMetricDef {
  id: string;
  label: string;
  modes: OutboundMode[];
  compute: (ctx: OutboundMetricCtx) => ComputedMetric | null;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const share = (n: number, total: number) => (total > 0 ? clamp01(n / total) : 0);

/** hours → "45m" / "3.2h" / "2d". */
function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${Math.round(h / 24)}d`;
}

/**
 * Shared ROI tiles — Dashboard Outbound + Shipping Pending both compose these
 * so "Packed this week" / "Units stuck" stay one compute, not a fork.
 */
export function computeRoiPackedMetric(roi: OperationsRoiData | null): ComputedMetric | null {
  if (!roi || roi.unitsThisWeek <= 0) return null;
  const peak = Math.max(roi.unitsThisWeek, roi.unitsLastWeek, 1);
  return {
    id: 'packed',
    label: 'Packed this week',
    value: roi.unitsThisWeek.toLocaleString(),
    fraction: share(roi.unitsThisWeek, peak),
    // A volume count is not a health state — the calm neutral value reads as
    // "this is how much", and the DeltaChip alone carries the up/down trend.
    intent: 'neutral',
    // Pure trend, never an alarm: severity 0 so it lands in the trend zone,
    // carried by its honest week-over-week delta.
    severity: 0,
    delta: roi.pctChange,
    tooltip: `Units packed this week (${roi.unitsThisWeek.toLocaleString()}) vs last week (${roi.unitsLastWeek.toLocaleString()}).`,
  };
}

export function computeRoiStuckMetric(roi: OperationsRoiData | null): ComputedMetric | null {
  if (!roi || roi.unitsStuck <= 0) return null;
  return {
    id: 'stuck',
    label: 'Units stuck',
    value: roi.unitsStuck.toLocaleString(),
    fraction: 1,
    intent: 'warn',
    severity: 2,
    status: 'Blocked / error',
    tooltip: `Units currently stuck in a blocked or error state across the workflow.`,
  };
}

/**
 * The registry. Order = display priority; the strip shows the first N non-null
 * for the active mode.
 */
export const OUTBOUND_METRICS: OutboundMetricDef[] = [
  {
    id: 'packed',
    label: 'Packed this week',
    modes: ['shipped', 'unshipped'],
    compute: ({ roi }) => computeRoiPackedMetric(roi),
  },
  {
    id: 'ontime',
    label: 'On-time ship',
    modes: ['shipped'],
    compute: ({ shipped }) => {
      if (shipped.onTimeCoverage <= 0) return null;
      const rate = shipped.onTime / shipped.onTimeCoverage;
      const pct = Math.round(rate * 100);
      return {
        id: 'ontime',
        label: 'On-time ship',
        value: `${pct}%`,
        fraction: rate,
        intent: pct >= 95 ? 'good' : pct >= 85 ? 'warn' : 'bad',
        // Healthy on-time is not something to "focus on" — it drops (sev 0); only
        // a slipping rate surfaces, louder the further it falls.
        severity: pct >= 95 ? 0 : pct >= 85 ? 2 : 3,
        status: pct >= 95 ? 'On track' : pct >= 85 ? 'Watch' : 'At risk',
        tooltip: `On-time ships ÷ ships with a deadline · ${shipped.onTime}/${shipped.onTimeCoverage}.`,
      };
    },
  },
  {
    id: 'dwell',
    label: 'Staging dwell',
    modes: ['shipped'],
    compute: ({ shipped }) => {
      const h = shipped.dwellMedianHours;
      if (h == null) return null;
      // Lower is better; a full ring = instant, empty = ≥24h.
      return {
        id: 'dwell',
        label: 'Staging dwell',
        value: fmtHours(h),
        fraction: clamp01(1 - h / 24),
        intent: h <= 4 ? 'good' : h <= 24 ? 'warn' : 'bad',
        // Fast staging drops; a slow dock is a bottleneck to work down.
        severity: h <= 4 ? 0 : h <= 24 ? 1 : 3,
        status: h <= 4 ? 'Fast' : h <= 24 ? 'Watch' : 'Slow',
        tooltip: `Median pack→dock staging time, over ${shipped.dwellCoverage} scanned-out ${shipped.dwellCoverage === 1 ? 'package' : 'packages'}.`,
      };
    },
  },
  {
    id: 'delivered',
    label: 'Delivered',
    modes: ['shipped'],
    compute: ({ shipped, total }) => {
      if (shipped.delivered <= 0) return null;
      return {
        id: 'delivered',
        label: 'Delivered',
        value: shipped.delivered.toLocaleString(),
        fraction: share(shipped.delivered, total),
        intent: 'good',
        // Delivered is a good-news status, not an action — dropped from the
        // attention strip (distribution lives on the board legend).
        severity: 0,
        status: `${Math.round(share(shipped.delivered, total) * 100)}% of week`,
        tooltip: `Delivered ÷ shipped this week · ${shipped.delivered}/${total}. Click to filter the board.`,
        filterState: 'DELIVERED',
      };
    },
  },
  {
    id: 'intransit',
    label: 'In transit',
    modes: ['shipped'],
    compute: ({ shipped, total }) => {
      if (shipped.inTransit <= 0) return null;
      return {
        id: 'intransit',
        label: 'In transit',
        value: shipped.inTransit.toLocaleString(),
        fraction: share(shipped.inTransit, total),
        intent: 'neutral',
        // In-carrier is neutral status, not an action — dropped from the strip.
        severity: 0,
        status: 'With carrier',
        tooltip: `In carrier custody ÷ shipped this week · ${shipped.inTransit}/${total}. Click to filter the board.`,
        filterState: 'IN_CUSTODY',
      };
    },
  },
  {
    id: 'exceptions',
    label: 'Exceptions',
    modes: ['shipped'],
    compute: ({ shipped, total }) => {
      if (shipped.exceptions <= 0) return null;
      const rate = share(shipped.exceptions, total);
      return {
        id: 'exceptions',
        label: 'Exceptions',
        value: shipped.exceptions.toLocaleString(),
        fraction: rate,
        // An exception is never "good" — any nonzero count is worth a look, louder
        // as the rate climbs.
        intent: rate > 0.05 ? 'bad' : 'warn',
        severity: rate > 0.05 ? 3 : rate > 0.02 ? 2 : 1,
        status: `${Math.round(rate * 100)}% of week`,
        tooltip: `Exceptions ÷ shipped this week · ${shipped.exceptions}/${total}. Click to filter the board.`,
        filterState: 'EXCEPTION',
      };
    },
  },
  {
    id: 'pending',
    label: 'Pending',
    modes: ['unshipped'],
    compute: ({ unshipped }) => {
      // Awaiting-test lane + out-of-stock — the open in-warehouse pressure.
      const tabTotal = unshipped.pending + unshipped.blocked;
      if (tabTotal <= 0) return null;
      return {
        id: 'pending',
        label: 'Pending',
        value: tabTotal.toLocaleString(),
        fraction: share(tabTotal, unshipped.total || tabTotal),
        intent: 'neutral',
        // Queue fact — pinned left via {@link OUTBOUND_QUEUE_ZONE_IDS}; severity
        // kept > 0 so empty-queue all-clear still works when nothing else shows.
        severity: 1,
        status: 'In queue',
        tooltip: `In-warehouse awaiting test + out of stock · ${tabTotal}. Click to clear triage facets (All).`,
        filterUstatus: 'PENDING',
      };
    },
  },
  {
    id: 'mustShip',
    label: 'Must ship',
    modes: ['unshipped'],
    compute: ({ unshipped }) => {
      const n = unshipped.mustShip ?? 0;
      if (n <= 0) return null;
      return {
        id: 'mustShip',
        label: 'Must ship',
        value: n.toLocaleString(),
        fraction: share(n, unshipped.total || n),
        intent: 'bad',
        severity: 3,
        status: 'Ship by today',
        tooltip: `Ship-by today or past (PST) · ${n}. Click to filter Must ship (?late=1).`,
        filterLate: true,
      };
    },
  },
  {
    id: 'urgent',
    label: 'Urgent',
    modes: ['unshipped'],
    compute: ({ unshipped }) => {
      if (unshipped.urgent <= 0) return null;
      return {
        id: 'urgent',
        label: 'Urgent',
        value: unshipped.urgent.toLocaleString(),
        fraction: share(unshipped.urgent, unshipped.total || unshipped.urgent),
        intent: 'warn',
        severity: 2,
        status: 'Expedited',
        tooltip: `Operator-flagged urgent orders · ${unshipped.urgent}. Click to filter the board.`,
        filterAttention: true,
      };
    },
  },
  {
    id: 'blocked',
    label: 'Out of stock',
    modes: ['unshipped'],
    compute: ({ unshipped }) => {
      if (unshipped.blocked <= 0) return null;
      return {
        id: 'blocked',
        label: 'Out of stock',
        value: unshipped.blocked.toLocaleString(),
        fraction: share(unshipped.blocked, unshipped.total || unshipped.blocked),
        intent: 'bad',
        // Check immediately — even 1 OOS unit needs a human.
        severity: 3,
        status: 'Check now',
        tooltip: `Out of stock ÷ open queue · ${unshipped.blocked}/${unshipped.total}. Click to filter the board.`,
        filterUstatus: 'BLOCKED',
      };
    },
  },
  {
    id: 'ready',
    label: 'Ready to pack',
    modes: ['unshipped'],
    compute: ({ unshipped }) => {
      if (unshipped.tested <= 0) return null;
      const denom = unshipped.pending + unshipped.tested;
      return {
        id: 'ready',
        label: 'Ready to pack',
        value: unshipped.tested.toLocaleString(),
        fraction: share(unshipped.tested, denom),
        intent: 'neutral',
        // Packable work — stays in the attention zone (not the pinned queue
        // cluster) so Pending / Urgent / OOS stay leftmost.
        severity: 1,
        status: 'In queue',
        tooltip: `Tested & ready to pack ÷ open queue · ${unshipped.tested}/${denom}. Click to filter Ready (?ustatus=TESTED).`,
        filterUstatus: 'TESTED',
      };
    },
  },
  {
    id: 'atStations',
    label: 'At stations',
    modes: ['unshipped'],
    compute: ({ unshipped }) => {
      const n = unshipped.atStations ?? 0;
      if (n <= 0) return null;
      return {
        id: 'atStations',
        label: 'At stations',
        value: n.toLocaleString(),
        fraction: share(n, unshipped.tested || n),
        intent: 'neutral',
        severity: 1,
        status: 'Placed',
        tooltip: `Ready-to-pack packages currently at a packing station or staging · ${n}. Click to filter placed packages.`,
        filterPackPlaced: true,
      };
    },
  },
  {
    id: 'stuck',
    label: 'Units stuck',
    modes: ['shipped', 'unshipped'],
    compute: ({ roi }) => computeRoiStuckMetric(roi),
  },
];

/** Every populated metric for a mode, in registry order (no zoning applied). */
export function resolveOutboundMetrics(ctx: OutboundMetricCtx): ComputedMetric[] {
  return OUTBOUND_METRICS.filter((d) => d.modes.includes(ctx.mode))
    .map((d) => d.compute(ctx))
    .filter((m): m is ComputedMetric => m != null);
}

/**
 * The attention view over the resolved metrics — the shape the redesigned
 * OutboundKpiStrip renders. Three zones:
 *
 *   • `queue` — pinned left on unshipped: Pending → Urgent → Out of stock
 *     ({@link OUTBOUND_QUEUE_ZONE_IDS}), only when each compute returned a tile.
 *   • `attention` — remaining `severity > 0` (not in queue), sorted by severity
 *     DESC then value DESC. Capped so the header stays scannable.
 *   • `trend` — `severity === 0` metrics that carry an honest week-over-week
 *     `delta` ("what's down from previous weeks"). Today only throughput has a
 *     real baseline; more join once the ROI endpoint returns prior-period values.
 *
 * Pure status with neither severity nor delta (delivered, in-transit) is
 * dropped on shipped — it lives on the board. When ALL zones are empty the
 * strip shows an all-clear.
 */
export interface OutboundAttention {
  queue: ComputedMetric[];
  attention: ComputedMetric[];
  trend: ComputedMetric[];
}

const QUEUE_ZONE_ID_SET = new Set<string>(OUTBOUND_QUEUE_ZONE_IDS);

export function splitOutboundAttention(
  metrics: ComputedMetric[],
  attentionLimit = 4,
): OutboundAttention {
  const parseValue = (m: ComputedMetric) => {
    const n = Number.parseFloat(m.value.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  const byId = new Map(metrics.map((m) => [m.id, m]));
  const queue = OUTBOUND_QUEUE_ZONE_IDS.map((id) => byId.get(id)).filter(
    (m): m is ComputedMetric => m != null,
  );
  const attention = metrics
    .filter((m) => m.severity > 0 && !QUEUE_ZONE_ID_SET.has(m.id))
    .sort((a, b) => b.severity - a.severity || parseValue(b) - parseValue(a))
    .slice(0, attentionLimit);
  const trend = metrics.filter((m) => m.severity === 0 && m.delta !== undefined);
  return { queue, attention, trend };
}
