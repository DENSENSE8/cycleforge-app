import type { MetricIntent } from '@/design-system/components/monitor';
import type { ComputedMetric } from '@/lib/dashboard/outbound-metrics';
import type { UnboxWorkspaceTab } from '@/utils/unbox-workspace-state';

export type { ComputedMetric };

export interface UnboxRecentCounts {
  total: number;
  openedToday: number;
  awaitingTest: number;
  stuck: number;
}

export interface UnboxQueueCounts {
  total: number;
  priority: number;
  oldestAgeHours: number;
}

export interface UnboxViewedCounts {
  total: number;
  viewedToday: number;
  unfinished: number;
}

interface UnboxMetricContext {
  mode: UnboxWorkspaceTab;
  recent: UnboxRecentCounts;
  queue: UnboxQueueCounts;
  viewed: UnboxViewedCounts;
}

interface UnboxMetricDef {
  id: string;
  modes: UnboxWorkspaceTab[];
  compute: (ctx: UnboxMetricContext) => ComputedMetric | null;
}

export const ZERO_UNBOX_RECENT: UnboxRecentCounts = {
  total: 0,
  openedToday: 0,
  awaitingTest: 0,
  stuck: 0,
};

export const ZERO_UNBOX_QUEUE: UnboxQueueCounts = {
  total: 0,
  priority: 0,
  oldestAgeHours: 0,
};

export const ZERO_UNBOX_VIEWED: UnboxViewedCounts = {
  total: 0,
  viewedToday: 0,
  unfinished: 0,
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

const UNBOX_METRICS: UnboxMetricDef[] = [
  {
    id: 'opened-today',
    modes: ['history'],
    compute: ({ recent }) =>
      recent.openedToday > 0
        ? metric(
            'opened-today',
            'Opened today',
            recent.openedToday.toLocaleString(),
            recent.openedToday,
            Math.max(recent.total, recent.openedToday),
            'good',
            0,
            'Today',
            'Cartons opened on the Unbox surface today.',
          )
        : null,
  },
  {
    id: 'awaiting-test',
    modes: ['history'],
    compute: ({ recent }) =>
      recent.awaitingTest > 0
        ? metric(
            'awaiting-test',
            'Awaiting test',
            recent.awaitingTest.toLocaleString(),
            recent.awaitingTest,
            Math.max(recent.total, 1),
            'warn',
            2,
            'Handoff',
            'Unboxed lines waiting for quality control.',
          )
        : null,
  },
  {
    id: 'stuck',
    modes: ['history'],
    compute: ({ recent }) =>
      recent.stuck > 0
        ? metric(
            'stuck',
            'Stuck / error',
            recent.stuck.toLocaleString(),
            recent.stuck,
            Math.max(recent.total, 1),
            'bad',
            4,
            'Blocked',
            'Unboxed cartons in an error or blocked workflow state.',
          )
        : null,
  },
  {
    id: 'queue-depth',
    modes: ['queue'],
    compute: ({ queue }) =>
      queue.total > 0
        ? metric(
            'queue-depth',
            'Door queue',
            queue.total.toLocaleString(),
            queue.total,
            queue.total,
            queue.total >= 20 ? 'warn' : 'neutral',
            queue.total >= 20 ? 3 : 1,
            'In queue',
            'Door-scanned cartons waiting to be unboxed.',
          )
        : null,
  },
  {
    id: 'priority',
    modes: ['queue'],
    compute: ({ queue }) =>
      queue.priority > 0
        ? metric(
            'priority',
            'Priority',
            queue.priority.toLocaleString(),
            queue.priority,
            Math.max(queue.total, 1),
            'warn',
            3,
            'Expedited',
            'Priority / expedited cartons in the door queue.',
          )
        : null,
  },
  {
    id: 'oldest-wait',
    modes: ['queue'],
    compute: ({ queue }) =>
      queue.oldestAgeHours > 0
        ? metric(
            'oldest-wait',
            'Oldest wait',
            queue.oldestAgeHours >= 24
              ? `${Math.floor(queue.oldestAgeHours / 24)}d`
              : `${Math.max(1, Math.round(queue.oldestAgeHours))}h`,
            queue.oldestAgeHours,
            24,
            queue.oldestAgeHours >= 24 ? 'bad' : queue.oldestAgeHours >= 8 ? 'warn' : 'neutral',
            queue.oldestAgeHours >= 24 ? 4 : 2,
            'Queue age',
            'Elapsed time since the oldest carton entered the door queue.',
          )
        : null,
  },
  {
    id: 'viewed-today',
    modes: ['recent'],
    compute: ({ viewed }) =>
      viewed.viewedToday > 0
        ? metric(
            'viewed-today',
            'Viewed today',
            viewed.viewedToday.toLocaleString(),
            viewed.viewedToday,
            Math.max(viewed.total, viewed.viewedToday),
            'neutral',
            0,
            'Today',
            'Lines you opened today in the Unbox workspace.',
          )
        : null,
  },
  {
    id: 'unfinished',
    modes: ['recent'],
    compute: ({ viewed }) =>
      viewed.unfinished > 0
        ? metric(
            'unfinished',
            'Unfinished',
            viewed.unfinished.toLocaleString(),
            viewed.unfinished,
            Math.max(viewed.total, 1),
            'warn',
            2,
            'Still open',
            'Recently viewed lines that are not yet fully received.',
          )
        : null,
  },
];

export function resolveUnboxMetrics(ctx: UnboxMetricContext): ComputedMetric[] {
  return UNBOX_METRICS.filter((definition) => definition.modes.includes(ctx.mode))
    .map((definition) => definition.compute(ctx))
    .filter((value): value is ComputedMetric => value != null);
}

export function splitUnboxAttention(metrics: ComputedMetric[]) {
  return {
    attention: metrics.filter((m) => m.severity >= 2),
    rest: metrics.filter((m) => m.severity < 2),
  };
}
