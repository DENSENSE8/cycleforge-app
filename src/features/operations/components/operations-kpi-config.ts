import type { DashboardCategory } from '@/features/operations/types';
import type { KpiKind } from './KpiDetailsModal';

export interface PrimaryKpiConfig {
  /** Modal kind opened on click. */
  kind: KpiKind;
  /** Which `summary` category backs the value + delta. */
  summaryKey: DashboardCategory;
  title: string;
  /** Repair: a `+` delta is bad, so positivity inverts. */
  invertDelta?: boolean;
}

/**
 * The four primary KPI tiles, in display order. Each tile shows only what the
 * `/api/dashboard/operations` snapshot actually returns — a real `value` and a
 * real `delta` — rendered through the Monitor `KpiTile`. (The former per-day bar
 * sparklines and donut "capacity" fills were fabricated: the snapshot carries no
 * series and no denominator, so they were removed rather than shown as real.)
 */
export const PRIMARY_KPI_CARDS: PrimaryKpiConfig[] = [
  { kind: 'velocity', summaryKey: 'all', title: 'Daily velocity' },
  { kind: 'tested', summaryKey: 'tested', title: 'Tested today' },
  { kind: 'fba', summaryKey: 'fba', title: 'FBA intake' },
  { kind: 'repair', summaryKey: 'repair', title: 'Repair queue', invertDelta: true },
];
