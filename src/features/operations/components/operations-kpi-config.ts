import type { DashboardCategory } from '@/features/operations/types';
import type { KpiKind } from './KpiDetailsModal';

interface PrimaryKpiConfig {
  /** Modal kind opened on click. */
  kind: KpiKind;
  /** Which `summary` category backs the value. */
  summaryKey: DashboardCategory;
  title: string;
  /** The WINDOW and the UNIT, in the operator's words, under the number. */
  meta: string;
}

/** The four primary KPI tiles, in display order. */
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
