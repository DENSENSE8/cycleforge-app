import type { MetricIntent } from '@/design-system/components/monitor';
import type { ComputedMetric } from '@/lib/dashboard/outbound-metrics';
import type { UnboxWorkspaceTab } from '@/utils/unbox-workspace-state';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { toPSTDateKey } from '@/utils/date';

export type { ComputedMetric };

/** URL param a clicked KPI tile toggles; `ReceivingLinesTable` reads it to narrow rows on Unbox. */
export const UNBOX_KPI_FILTER_PARAM = 'ukpi';

interface UnboxRecentCounts {
  total: number;
  openedToday: number;
  awaitingTest: number;
  stuck: number;
}

interface UnboxQueueCounts {
  total: number;
  priority: number;
  oldestAgeHours: number;
}

interface UnboxViewedCounts {
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

// ── Row predicates — the single source both the metric COUNTS above and the
// KPI-tile-as-filter (below) read. A row's membership in "stuck" must never
// be answered two different ways.

function isUnboxStuck(row: ReceivingLineRow): boolean {
  const status = `${row.workflow_status || ''} ${row.qa_status || ''}`.toUpperCase();
  return status.includes('ERROR') || status.includes('BLOCK') || status.includes('STUCK');
}

function isUnboxAwaitingTest(row: ReceivingLineRow): boolean {
  const status = String(row.workflow_status || '').toUpperCase();
  return status === 'AWAITING_TEST' || status === 'UNBOXED';
}

function isUnboxPriority(row: ReceivingLineRow): boolean {
  if (row.is_priority === true) return true;
  if (typeof row.priority_tier === 'number' && row.priority_tier === 0) return true;
  const lane = String(row.priority_lane || '').toLowerCase();
  return lane === 'priority' || lane === 'expedited' || lane === 'high';
}

function isUnboxUnfinished(row: ReceivingLineRow): boolean {
  const status = String(row.workflow_status || '').toUpperCase();
  return status !== 'DONE' && status !== 'RECEIVED' && status !== 'COMPLETE';
}

function isTodayKey(instant: string | null | undefined, today: string): boolean {
  if (!instant) return false;
  try {
    return toPSTDateKey(instant) === today;
  } catch {
    return false;
  }
}

function isUnboxOpenedToday(row: ReceivingLineRow, today: string): boolean {
  return isTodayKey(row.unboxed_at ?? row.unbox_opened_at, today);
}

function isUnboxViewedToday(row: ReceivingLineRow, today: string): boolean {
  const instant =
    (row as ReceivingLineRow & { viewed_at?: string | null }).viewed_at ??
    row.last_activity_at ??
    row.updated_at ??
    row.created_at;
  return isTodayKey(instant, today);
}

/** History tab count bag — reads the same row predicates the filter below reuses. */
export function recentCounts(rows: ReceivingLineRow[]): UnboxRecentCounts {
  const today = toPSTDateKey(new Date());
  let openedToday = 0;
  let awaitingTest = 0;
  let stuck = 0;
  for (const row of rows) {
    // "Opened today" counts real unbox stamps only — the shared History feed
    // (view=activity) also carries scanned-but-never-opened rows, whose door
    // scan must not inflate an "opened" metric.
    if (isUnboxOpenedToday(row, today)) openedToday += 1;
    if (isUnboxAwaitingTest(row)) awaitingTest += 1;
    if (isUnboxStuck(row)) stuck += 1;
  }
  return { total: rows.length, openedToday, awaitingTest, stuck };
}

/** Queue tab count bag. `total` prefers the server's true door-queue depth over the capped fetch window. */
export function queueCounts(rows: ReceivingLineRow[], serverTotal?: number): UnboxQueueCounts {
  const now = Date.now();
  let oldest = 0;
  let priority = 0;
  for (const row of rows) {
    if (isUnboxPriority(row)) priority += 1;
    const entered = row.scanned_at ?? row.received_at ?? row.created_at;
    if (entered) {
      const age = Math.max(0, (now - new Date(entered).getTime()) / 3_600_000);
      if (Number.isFinite(age)) oldest = Math.max(oldest, age);
    }
  }
  const total =
    Number.isFinite(serverTotal) && serverTotal != null
      ? Math.max(rows.length, serverTotal)
      : rows.length;
  return { total, priority, oldestAgeHours: oldest };
}

/** Recent tab count bag. */
export function viewedCounts(rows: ReceivingLineRow[]): UnboxViewedCounts {
  const today = toPSTDateKey(new Date());
  let viewedToday = 0;
  let unfinished = 0;
  for (const row of rows) {
    if (isUnboxViewedToday(row, today)) viewedToday += 1;
    if (isUnboxUnfinished(row)) unfinished += 1;
  }
  return { total: rows.length, viewedToday, unfinished };
}

/**
 * Row predicate for a clickable KPI tile, keyed by metric id + active tab —
 * the same membership test `recentCounts`/`queueCounts`/`viewedCounts` used to
 * produce the number on the tile. `null` means "not filterable": `queue-depth`
 * is a count, `oldest-wait` is a duration — neither is a row membership test,
 * so those two tiles stay informational (no `onOpen`).
 */
export function unboxKpiRowFilter(
  metricId: string | null | undefined,
  mode: UnboxWorkspaceTab,
): ((row: ReceivingLineRow) => boolean) | null {
  if (!metricId) return null;
  const today = toPSTDateKey(new Date());
  if (mode === 'history') {
    if (metricId === 'awaiting-test') return isUnboxAwaitingTest;
    if (metricId === 'stuck') return isUnboxStuck;
    if (metricId === 'opened-today') return (row) => isUnboxOpenedToday(row, today);
  } else if (mode === 'queue') {
    if (metricId === 'priority') return isUnboxPriority;
  } else if (mode === 'recent') {
    if (metricId === 'unfinished') return isUnboxUnfinished;
    if (metricId === 'viewed-today') return (row) => isUnboxViewedToday(row, today);
  }
  return null;
}

/** Metric ids `unboxKpiRowFilter` can answer for a given tab — drives which tiles render as clickable. */
export function isUnboxKpiFilterable(metricId: string, mode: UnboxWorkspaceTab): boolean {
  return unboxKpiRowFilter(metricId, mode) != null;
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
