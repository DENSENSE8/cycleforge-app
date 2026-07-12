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
  unshipped: { total: number; pending: number; tested: number; blocked: number };
  /** Org throughput ROI (null when ungated / no data). */
  roi: OperationsRoiData | null;
}

/** A metric resolved for render — consumed 1:1 by `MetricTile`. */
export interface ComputedMetric {
  id: string;
  label: string;
  value: string;
  /** 0..1 gauge fill. */
  fraction: number;
  intent: MetricIntent;
  status?: string;
  delta?: number;
  deltaInvert?: boolean;
  /** One-line HoverTooltip definition (with numerator/denominator where it clarifies). */
  tooltip?: string;
  /**
   * When set, the tile is a Monitor filter: clicking it toggles the shipped board's
   * `?ostatus` to this outbound state (via `useOutboundStatusFilter`). Level metrics
   * that map to a real derived state get this; rate/trend metrics (packed, on-time)
   * have no honest state filter, so they stay tooltip-only.
   */
  filterState?: OutboundState;
}

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
 * The registry. Order = display priority; the strip shows the first N non-null
 * for the active mode.
 */
export const OUTBOUND_METRICS: OutboundMetricDef[] = [
  {
    id: 'packed',
    label: 'Packed this week',
    modes: ['shipped', 'unshipped'],
    compute: ({ roi }) => {
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
        delta: roi.pctChange,
        tooltip: `Units packed this week (${roi.unitsThisWeek.toLocaleString()}) vs last week (${roi.unitsLastWeek.toLocaleString()}).`,
      };
    },
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
        intent: rate > 0.05 ? 'bad' : rate > 0.02 ? 'warn' : 'good',
        status: `${Math.round(rate * 100)}% of week`,
        tooltip: `Exceptions ÷ shipped this week · ${shipped.exceptions}/${total}. Click to filter the board.`,
        filterState: 'EXCEPTION',
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
        intent: 'good',
        status: 'Tested',
        tooltip: `Tested & ready to pack ÷ open queue · ${unshipped.tested}/${denom}.`,
      };
    },
  },
  {
    id: 'awaiting',
    label: 'Awaiting test',
    modes: ['unshipped'],
    compute: ({ unshipped }) => {
      if (unshipped.pending <= 0) return null;
      const denom = unshipped.pending + unshipped.tested;
      return {
        id: 'awaiting',
        label: 'Awaiting test',
        value: unshipped.pending.toLocaleString(),
        fraction: share(unshipped.pending, denom),
        intent: 'neutral',
        status: 'In queue',
        tooltip: `Awaiting test ÷ open queue · ${unshipped.pending}/${denom}.`,
      };
    },
  },
  {
    id: 'blocked',
    label: 'Blocked',
    modes: ['unshipped'],
    compute: ({ unshipped }) => {
      if (unshipped.blocked <= 0) return null;
      return {
        id: 'blocked',
        label: 'Blocked',
        value: unshipped.blocked.toLocaleString(),
        fraction: share(unshipped.blocked, unshipped.total),
        intent: 'bad',
        status: 'Needs attention',
        tooltip: `Blocked ÷ open queue · ${unshipped.blocked}/${unshipped.total}.`,
      };
    },
  },
  {
    id: 'stuck',
    label: 'Units stuck',
    modes: ['shipped', 'unshipped'],
    compute: ({ roi }) => {
      if (!roi || roi.unitsStuck <= 0) return null;
      return {
        id: 'stuck',
        label: 'Units stuck',
        value: roi.unitsStuck.toLocaleString(),
        fraction: 1,
        intent: 'warn',
        status: 'Blocked / error',
        tooltip: `Units currently stuck in a blocked or error state across the workflow.`,
      };
    },
  },
];

/** Resolve the tiles to show for a mode: first N populated, in registry order. */
export function resolveOutboundMetrics(ctx: OutboundMetricCtx, limit = 4): ComputedMetric[] {
  return OUTBOUND_METRICS.filter((d) => d.modes.includes(ctx.mode))
    .map((d) => d.compute(ctx))
    .filter((m): m is ComputedMetric => m != null)
    .slice(0, limit);
}
