import type { DashboardCategory } from '@/features/operations/types';
import type { KpiKind } from './KpiDetailsModal';

export interface PrimaryKpiConfig {
  /** Modal kind opened on click. */
  kind: KpiKind;
  /** Which `summary` category backs the value. */
  summaryKey: DashboardCategory;
  title: string;
  /**
   * The WINDOW and the UNIT, in the operator's words, under the number.
   *
   * Required, not optional: the 2026-09-16 audit found every one of these tiles
   * naming a unit its query did not count — "Daily velocity" over a mixed scan
   * count, "FBA intake" over raw scan events that double-count a rescan, and a
   * queue-depth snapshot sitting in a row of today-scoped tiles. A tile that
   * cannot state its window and unit does not belong on a monitor.
   */
  meta: string;
}

/**
 * The four primary KPI tiles, in display order.
 *
 * Each shows ONLY what the `/api/dashboard/operations` snapshot actually
 * returns — a real `value`, and nothing else. What was removed, and why:
 *
 * - **Sparklines and donut fills** (earlier pass): fabricated. The snapshot
 *   carries no series and no denominator.
 * - **Delta chips** (2026-09-16): the comparison divided today-so-far by all of
 *   yesterday, so it measured the clock. Three of the six were hardcoded `0`.
 *   Operator: *"I cannot trust any of the information within the display."*
 *
 * What replaced them is not another visual: it is `meta`, a sentence per tile
 * saying what the number counts and over what window. A trend needs a
 * comparable window (today-so-far vs same-time-yesterday) and that is a real
 * increment, not a chip.
 *
 * Titles were renamed to the thing counted. "Daily velocity" became "Scans
 * today" because the query is
 * `count(DISTINCT COALESCE(shipment_id, scan_ref, id))` across five activity
 * types at every station — a scan count, which is not reconcilable against any
 * order, unit or box an operator counts, and the old name implied it was.
 */
export const PRIMARY_KPI_CARDS: PrimaryKpiConfig[] = [
  {
    kind: 'velocity',
    summaryKey: 'all',
    title: 'Scans today',
    meta: 'Distinct scans, every station · today, PST',
  },
  {
    kind: 'tested',
    summaryKey: 'tested',
    title: 'Tested today',
    meta: 'Distinct tech-bench scans · today, PST',
  },
  {
    kind: 'fba',
    summaryKey: 'fba',
    title: 'FBA scans today',
    meta: 'FNSKU scan events, rescans included · today, PST',
  },
  {
    kind: 'repair',
    summaryKey: 'repair',
    title: 'Repair queue',
    meta: 'Open repairs right now · not a daily count',
  },
];
