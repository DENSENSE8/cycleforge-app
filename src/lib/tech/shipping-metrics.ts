/**
 * Shipping workspace KPI registry — pure descriptors for Pending / FBA / History
 * strips on `/test` Shipping mode. Sibling of `outbound-metrics.ts`; composes the
 * same `ComputedMetric` shape so Monitor `KpiTile`s stay one family.
 */

import type { MetricIntent } from '@/design-system/components/monitor';
import type { ComputedMetric } from '@/lib/dashboard/outbound-metrics';
import type { ShippingWorkspaceTab } from '@/utils/shipping-workspace-state';

export type { ComputedMetric };

export interface ShippingFbaCounts {
  planned: number;
  tested: number;
  packed: number;
  outOfStock: number;
  labeled: number;
}

export interface ShippingHistoryCounts {
  /** Scans in the loaded week window. */
  weekTotal: number;
  /** Scans on today's PST civil date within the week set. */
  todayTotal: number;
  /** Rows still without carrier acceptance / ship flag. */
  awaitingShip: number;
}

export interface ShippingMetricCtx {
  mode: ShippingWorkspaceTab;
  unshipped: { total: number; pending: number; tested: number; blocked: number };
  fba: ShippingFbaCounts;
  history: ShippingHistoryCounts;
}

export interface ShippingMetricDef {
  id: string;
  label: string;
  modes: ShippingWorkspaceTab[];
  compute: (ctx: ShippingMetricCtx) => ComputedMetric | null;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const share = (n: number, total: number) => (total > 0 ? clamp01(n / total) : 0);

function tile(
  id: string,
  label: string,
  value: string,
  fraction: number,
  intent: MetricIntent,
  severity: number,
  extra?: Partial<ComputedMetric>,
): ComputedMetric {
  return { id, label, value, fraction, intent, severity, ...extra };
}

export const SHIPPING_METRICS: ShippingMetricDef[] = [
  // ── Pending (queue pressure) ────────────────────────────────────────────
  {
    id: 'ready',
    label: 'Ready to pack',
    modes: ['pending'],
    compute: ({ unshipped }) => {
      if (unshipped.tested <= 0) return null;
      return tile(
        'ready',
        'Ready to pack',
        unshipped.tested.toLocaleString(),
        share(unshipped.tested, unshipped.total),
        'neutral',
        1,
        { status: 'In queue', tooltip: `Tested / ready units awaiting pack (${unshipped.tested}).` },
      );
    },
  },
  {
    id: 'awaiting',
    label: 'Awaiting test',
    modes: ['pending'],
    compute: ({ unshipped }) => {
      if (unshipped.pending <= 0) return null;
      return tile(
        'awaiting',
        'Awaiting test',
        unshipped.pending.toLocaleString(),
        share(unshipped.pending, unshipped.total),
        'warn',
        1,
        { status: 'Backlog', tooltip: `Pending units still awaiting test (${unshipped.pending}).` },
      );
    },
  },
  {
    id: 'blocked',
    label: 'Blocked',
    modes: ['pending'],
    compute: ({ unshipped }) => {
      if (unshipped.blocked <= 0) return null;
      return tile(
        'blocked',
        'Blocked',
        unshipped.blocked.toLocaleString(),
        share(unshipped.blocked, unshipped.total),
        'bad',
        3,
        { status: 'Check now', tooltip: `Blocked units needing attention (${unshipped.blocked}).` },
      );
    },
  },

  // ── FBA (ship-readiness) ────────────────────────────────────────────────
  {
    id: 'fba-labeled',
    label: 'Labeled',
    modes: ['fba'],
    compute: ({ fba }) => {
      if (fba.labeled <= 0) return null;
      const denom = fba.planned + fba.tested + fba.packed + fba.labeled + fba.outOfStock;
      return tile(
        'fba-labeled',
        'Labeled',
        fba.labeled.toLocaleString(),
        share(fba.labeled, denom),
        'good',
        1,
        { status: 'Ready to ship', tooltip: `FBA items with labels assigned (${fba.labeled}).` },
      );
    },
  },
  {
    id: 'fba-packed',
    label: 'Packed',
    modes: ['fba'],
    compute: ({ fba }) => {
      if (fba.packed <= 0) return null;
      const denom = fba.planned + fba.tested + fba.packed + fba.labeled + fba.outOfStock;
      return tile(
        'fba-packed',
        'Packed',
        fba.packed.toLocaleString(),
        share(fba.packed, denom),
        'neutral',
        1,
        { status: 'In progress', tooltip: `FBA items packed, awaiting label (${fba.packed}).` },
      );
    },
  },
  {
    id: 'fba-oos',
    label: 'Out of stock',
    modes: ['fba'],
    compute: ({ fba }) => {
      if (fba.outOfStock <= 0) return null;
      const denom = fba.planned + fba.tested + fba.packed + fba.labeled + fba.outOfStock;
      return tile(
        'fba-oos',
        'Out of stock',
        fba.outOfStock.toLocaleString(),
        share(fba.outOfStock, denom),
        'bad',
        3,
        { status: 'Blocked', tooltip: `FBA items marked out of stock (${fba.outOfStock}).` },
      );
    },
  },
  {
    id: 'fba-planned',
    label: 'Planned',
    modes: ['fba'],
    compute: ({ fba }) => {
      if (fba.planned <= 0) return null;
      const denom = fba.planned + fba.tested + fba.packed + fba.labeled + fba.outOfStock;
      return tile(
        'fba-planned',
        'Planned',
        fba.planned.toLocaleString(),
        share(fba.planned, denom),
        'neutral',
        0,
        { tooltip: `FBA items still in plan (${fba.planned}).` },
      );
    },
  },

  // ── History (tech scan-out throughput) ──────────────────────────────────
  {
    id: 'hist-today',
    label: 'Scanned today',
    modes: ['history'],
    compute: ({ history }) => {
      if (history.todayTotal <= 0) return null;
      return tile(
        'hist-today',
        'Scanned today',
        history.todayTotal.toLocaleString(),
        share(history.todayTotal, Math.max(history.weekTotal, history.todayTotal)),
        'neutral',
        0,
        { tooltip: `Tech scan-outs today (${history.todayTotal}).` },
      );
    },
  },
  {
    id: 'hist-week',
    label: 'This week',
    modes: ['history'],
    compute: ({ history }) => {
      if (history.weekTotal <= 0) return null;
      return tile(
        'hist-week',
        'This week',
        history.weekTotal.toLocaleString(),
        1,
        'neutral',
        0,
        { tooltip: `Tech scan-outs in the loaded week (${history.weekTotal}).` },
      );
    },
  },
  {
    id: 'hist-awaiting',
    label: 'Awaiting ship',
    modes: ['history'],
    compute: ({ history }) => {
      if (history.awaitingShip <= 0) return null;
      return tile(
        'hist-awaiting',
        'Awaiting ship',
        history.awaitingShip.toLocaleString(),
        share(history.awaitingShip, history.weekTotal),
        'warn',
        1,
        {
          status: 'Dock',
          tooltip: `Scanned rows not yet in carrier custody (${history.awaitingShip}).`,
        },
      );
    },
  },
];

/** Resolve metrics for the active shipping tab; null computes are dropped. */
export function resolveShippingMetrics(ctx: ShippingMetricCtx): ComputedMetric[] {
  return SHIPPING_METRICS.filter((m) => m.modes.includes(ctx.mode))
    .map((m) => m.compute(ctx))
    .filter((m): m is ComputedMetric => m != null);
}

/** Attention (severity > 0) left, then remaining tiles — mirrors outbound strip zoning. */
export function splitShippingAttention(metrics: ComputedMetric[]): {
  attention: ComputedMetric[];
  rest: ComputedMetric[];
} {
  const attention = metrics
    .filter((m) => m.severity > 0)
    .sort((a, b) => b.severity - a.severity);
  const rest = metrics.filter((m) => m.severity <= 0);
  return { attention, rest };
}

export const ZERO_SHIPPING_FBA: ShippingFbaCounts = {
  planned: 0,
  tested: 0,
  packed: 0,
  outOfStock: 0,
  labeled: 0,
};

export const ZERO_SHIPPING_HISTORY: ShippingHistoryCounts = {
  weekTotal: 0,
  todayTotal: 0,
  awaitingShip: 0,
};
