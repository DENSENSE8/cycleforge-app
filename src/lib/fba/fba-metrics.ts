/**
 * FBA board KPI registry — pure stage-count + metric resolvers for the FBA
 * outbound workspace (`/outbound?mode=fba`). Sibling of
 * `lib/tech/shipping-metrics.ts` / `lib/dashboard/outbound-metrics.ts`;
 * composes the same `ComputedMetric` shape so Monitor `KpiTile`s stay one
 * family. Counts are over the loaded board slice (mode + week filtered), not
 * the org-wide `/api/fba/stage-counts` rollup the `/test` Shipping strip reads.
 */

import type { ComputedMetric } from '@/lib/dashboard/outbound-metrics';
import type { FbaBoardItem } from '@/lib/fba/types';

/** Board status facet — `ALL` clears; the rest match `item_status` uppercased. */
export type FbaBoardStatusFilter =
  | 'ALL'
  | 'PLANNED'
  | 'TESTED'
  | 'PACKED'
  | 'LABEL_ASSIGNED'
  | 'OUT_OF_STOCK';

export interface FbaBoardStageCounts {
  lines: number;
  units: number;
  PLANNED: number;
  TESTED: number;
  PACKED: number;
  LABEL_ASSIGNED: number;
  OUT_OF_STOCK: number;
}

export const ZERO_FBA_BOARD_COUNTS: FbaBoardStageCounts = {
  lines: 0,
  units: 0,
  PLANNED: 0,
  TESTED: 0,
  PACKED: 0,
  LABEL_ASSIGNED: 0,
  OUT_OF_STOCK: 0,
};

/** Stage counts over the current board slice (formerly inlined in `FbaBoardTable`). */
export function computeFbaBoardStageCounts(items: FbaBoardItem[]): FbaBoardStageCounts {
  const counts = { ...ZERO_FBA_BOARD_COUNTS };
  for (const item of items) {
    const s = item.item_status.toUpperCase();
    if (s === 'PLANNED' || s === 'TESTED' || s === 'PACKED' || s === 'LABEL_ASSIGNED' || s === 'OUT_OF_STOCK') {
      counts[s] += 1;
    }
    counts.units += Math.max(0, Number(item.actual_qty) || 0);
  }
  counts.lines = items.length;
  return counts;
}

/** A board metric: `ComputedMetric` + the board status facet its tile toggles. */
export interface FbaBoardMetric extends ComputedMetric {
  /** When set, clicking the tile toggles this board status facet (`ALL` clears). */
  filterStatus?: FbaBoardStatusFilter;
}

/**
 * Resolve the FBA board KPI tiles. One resolver so the strip and any future
 * consumer (e.g. the `/test` Shipping FBA tab) agree on labels, order, and
 * intent tones — never re-derive counts at a call site.
 */
export function resolveFbaBoardMetrics(counts: FbaBoardStageCounts): FbaBoardMetric[] {
  return [
    {
      id: 'fba-lines',
      label: 'Lines',
      value: String(counts.lines),
      fraction: 0,
      intent: 'neutral',
      severity: 0,
      tooltip: 'Board lines in the current week / mode slice',
      filterStatus: 'ALL',
    },
    {
      id: 'fba-units',
      label: 'Units',
      value: String(counts.units),
      fraction: 0,
      intent: 'neutral',
      severity: 0,
      tooltip: 'Actual units across the visible lines',
    },
    {
      id: 'fba-planned',
      label: 'Planned',
      value: String(counts.PLANNED),
      fraction: 0,
      intent: 'warn',
      severity: counts.PLANNED > 0 ? 1 : 0,
      tooltip: 'Awaiting test — scan FNSKUs at the plan bench',
      filterStatus: 'PLANNED',
    },
    {
      id: 'fba-tested',
      label: 'Tested',
      value: String(counts.TESTED),
      fraction: 0,
      intent: 'good',
      severity: 0,
      tooltip: 'Tested, awaiting pack',
      filterStatus: 'TESTED',
    },
    {
      id: 'fba-packed',
      label: 'Packed',
      value: String(counts.PACKED),
      fraction: 0,
      intent: 'neutral',
      severity: 0,
      tooltip: 'Packed, ready to combine under a shipment',
      filterStatus: 'PACKED',
    },
    {
      id: 'fba-combined',
      label: 'Combined',
      value: String(counts.LABEL_ASSIGNED),
      fraction: 0,
      intent: 'good',
      severity: 0,
      tooltip: 'Combined under an FBA shipment (label assigned)',
      filterStatus: 'LABEL_ASSIGNED',
    },
    {
      id: 'fba-oos',
      label: 'OOS',
      value: String(counts.OUT_OF_STOCK),
      fraction: 0,
      intent: counts.OUT_OF_STOCK > 0 ? 'bad' : 'neutral',
      severity: counts.OUT_OF_STOCK > 0 ? 2 : 0,
      tooltip: 'Out of stock — planned but no unit on hand',
      filterStatus: 'OUT_OF_STOCK',
    },
  ];
}
