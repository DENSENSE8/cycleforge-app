import type { MetricIntent } from '@/design-system/components/monitor';
import type { ComputedMetric } from '@/lib/dashboard/outbound-metrics';
import type { TestingWorkspaceTab } from '@/utils/testing-workspace-state';

export type { ComputedMetric };

export interface TestingQueueCounts {
  total: number;
  assignedToMe: number;
  unassigned: number;
  oldestAgeHours: number;
  platformCount: number;
}

export interface TestingHistoryCounts {
  weekTotal: number;
  todayTotal: number;
  failed: number;
  retest: number;
}

interface TestingMetricContext {
  mode: TestingWorkspaceTab;
  queue: TestingQueueCounts;
  history: TestingHistoryCounts;
}

interface TestingMetricDef {
  id: string;
  modes: TestingWorkspaceTab[];
  compute: (ctx: TestingMetricContext) => ComputedMetric | null;
}

export const ZERO_TESTING_QUEUE: TestingQueueCounts = {
  total: 0,
  assignedToMe: 0,
  unassigned: 0,
  oldestAgeHours: 0,
  platformCount: 0,
};

export const ZERO_TESTING_HISTORY: TestingHistoryCounts = {
  weekTotal: 0,
  todayTotal: 0,
  failed: 0,
  retest: 0,
};

const fraction = (value: number, total: number) =>
  total > 0 ? Math.max(0, Math.min(1, value / total)) : 0;

function metric(
  id: string,
  label: string,
  value: string,
  part: number,
  total: number,
  intent: MetricIntent,
  severity: number,
  status: string,
  tooltip: string,
): ComputedMetric {
  return {
    id,
    label,
    value,
    fraction: fraction(part, total),
    intent,
    severity,
    status,
    tooltip,
  };
}

const TESTING_METRICS: TestingMetricDef[] = [
  {
    id: 'queue-depth',
    modes: ['pending', 'returns', 'urgent', 'all'],
    compute: ({ queue }) =>
      queue.total > 0
        ? metric(
            'queue-depth',
            'Waiting',
            queue.total.toLocaleString(),
            queue.total,
            queue.total,
            queue.total >= 20 ? 'warn' : 'neutral',
            queue.total >= 20 ? 3 : 1,
            'Queue depth',
            `${queue.total} lines are ready for quality control.`,
          )
        : null,
  },
  {
    id: 'oldest',
    modes: ['pending', 'returns', 'urgent', 'all'],
    compute: ({ queue }) =>
      queue.oldestAgeHours > 0
        ? metric(
            'oldest',
            'Oldest wait',
            queue.oldestAgeHours >= 24
              ? `${Math.floor(queue.oldestAgeHours / 24)}d`
              : `${Math.max(1, Math.round(queue.oldestAgeHours))}h`,
            queue.oldestAgeHours,
            24,
            queue.oldestAgeHours >= 24 ? 'bad' : queue.oldestAgeHours >= 8 ? 'warn' : 'neutral',
            queue.oldestAgeHours >= 24 ? 4 : 2,
            'Queue age',
            'Elapsed time since the oldest line entered the testing queue.',
          )
        : null,
  },
  {
    id: 'mine',
    modes: ['pending', 'returns', 'urgent', 'all'],
    compute: ({ queue }) =>
      queue.assignedToMe > 0
        ? metric(
            'mine',
            'Assigned to you',
            queue.assignedToMe.toLocaleString(),
            queue.assignedToMe,
            queue.total,
            'good',
            0,
            'Personal queue',
            'Lines currently assigned to the signed-in technician.',
          )
        : null,
  },
  {
    id: 'unassigned',
    modes: ['pending', 'returns', 'urgent', 'all'],
    compute: ({ queue }) =>
      queue.unassigned > 0
        ? metric(
            'unassigned',
            'Unassigned',
            queue.unassigned.toLocaleString(),
            queue.unassigned,
            queue.total,
            'warn',
            3,
            'Needs owner',
            'Ready lines without an assigned technician.',
          )
        : null,
  },
  {
    id: 'platforms',
    modes: ['returns'],
    compute: ({ queue }) =>
      queue.platformCount > 0
        ? metric(
            'platforms',
            'Return sources',
            queue.platformCount.toLocaleString(),
            queue.platformCount,
            Math.max(queue.platformCount, 1),
            'neutral',
            0,
            'Platform mix',
            'Distinct source platforms represented in the return queue.',
          )
        : null,
  },
  {
    id: 'tested-today',
    modes: ['history'],
    compute: ({ history }) =>
      history.todayTotal > 0
        ? metric(
            'tested-today',
            'Tested today',
            history.todayTotal.toLocaleString(),
            history.todayTotal,
            Math.max(history.weekTotal, history.todayTotal),
            'good',
            0,
            'Today',
            'Lines with a recorded testing verdict today.',
          )
        : null,
  },
  {
    id: 'tested-week',
    modes: ['history'],
    compute: ({ history }) =>
      history.weekTotal > 0
        ? metric(
            'tested-week',
            'Tested in week',
            history.weekTotal.toLocaleString(),
            history.weekTotal,
            history.weekTotal,
            'neutral',
            0,
            'Throughput',
            'Lines with a recorded testing verdict in the loaded week.',
          )
        : null,
  },
  {
    id: 'failed',
    modes: ['history'],
    compute: ({ history }) =>
      history.failed > 0
        ? metric(
            'failed',
            'Failed',
            history.failed.toLocaleString(),
            history.failed,
            history.weekTotal,
            'bad',
            4,
            'Needs review',
            'Tested lines whose latest workflow or QA result is failed.',
          )
        : null,
  },
  {
    id: 'retest',
    modes: ['history'],
    compute: ({ history }) =>
      history.retest > 0
        ? metric(
            'retest',
            'Re-tested',
            history.retest.toLocaleString(),
            history.retest,
            history.weekTotal,
            'warn',
            2,
            'Repeat pass',
            'Lines with more recorded verdicts than received units.',
          )
        : null,
  },
];

export function resolveTestingMetrics(ctx: TestingMetricContext): ComputedMetric[] {
  return TESTING_METRICS.filter((definition) => definition.modes.includes(ctx.mode))
    .map((definition) => definition.compute(ctx))
    .filter((value): value is ComputedMetric => value != null);
}

export function splitTestingAttention(metrics: ComputedMetric[]) {
  return {
    attention: metrics.filter((metric) => metric.severity >= 2),
    rest: metrics.filter((metric) => metric.severity < 2),
  };
}
