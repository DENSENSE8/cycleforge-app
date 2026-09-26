import type { MetricIntent } from '@/design-system/components/monitor';
import type { ComputedMetric } from '@/lib/dashboard/outbound-metrics';
import type { UnboxWorkspaceTab } from '@/utils/unbox-workspace-state';
import { unboxKpiFeedTab } from '@/utils/unbox-workspace-state';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { toPSTDateKey } from '@/utils/date';

/** URL param a clicked KPI tile toggles; `ReceivingLinesTable` reads it to narrow rows on Unbox. */
export const UNBOX_KPI_FILTER_PARAM = 'ukpi';

/** URL time window for the Band 2 KPI canvas (`?urange=`). */
export type UnboxKpiRange = '24h' | '7d' | '30d' | '90d';

/** URL viz mode for the Band 2 KPI canvas (`?uviz=`). */
export type UnboxKpiViz = 'tiles' | 'bars' | 'pie' | 'line';

export type UnboxKpiGranularity = 'hourly' | 'daily';

export interface UnboxKpiSeriesPoint {
  at: string;
  value: number;
}

export interface UnboxKpiBreakdown {
  key: string;
  label: string;
  value: number;
}

export interface UnboxKpiMetricCard {
  id: string;
  label: string;
  value: string;
  intent: MetricIntent;
  severity: number;
  tooltip?: string;
  series: UnboxKpiSeriesPoint[];
  breakdown: UnboxKpiBreakdown[];
  filterable: boolean;
}

const UNBOX_KPI_RANGES: readonly UnboxKpiRange[] = ['24h', '7d', '30d', '90d'] as const;

export function parseUnboxKpiRange(raw: string | null | undefined): UnboxKpiRange {
  return raw === '24h' || raw === '30d' || raw === '90d' ? raw : '7d';
}

/** Parse legacy `?uviz=` (Band 2 no longer writes it; kept for URL hygiene). */
export function parseUnboxKpiViz(raw: string | null | undefined): UnboxKpiViz {
  return raw === 'tiles' || raw === 'bars' || raw === 'pie' || raw === 'line' ? raw : 'pie';
}

/** Inclusive window + bucket granularity for a Band 2 range. */
export function unboxKpiRangeWindow(range: UnboxKpiRange, now = new Date()): {
  start: Date;
  end: Date;
  granularity: UnboxKpiGranularity;
} {
  const end = new Date(now);
  const start = new Date(now);
  if (range === '24h') {
    start.setTime(end.getTime() - 24 * 3_600_000);
    return { start, end, granularity: 'hourly' };
  }
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  start.setTime(end.getTime() - days * 86_400_000);
  return { start, end, granularity: 'daily' };
}

function slotStartMs(d: Date, granularity: UnboxKpiGranularity): number {
  const x = new Date(d);
  if (granularity === 'daily') {
    x.setUTCHours(0, 0, 0, 0);
  } else {
    x.setUTCMinutes(0, 0, 0);
  }
  return x.getTime();
}

/** Gap-filled ISO bucket keys from `start` → `end` at the given granularity. */
export function fillUnboxKpiBuckets(
  start: Date,
  end: Date,
  granularity: UnboxKpiGranularity,
): string[] {
  const step = granularity === 'daily' ? 86_400_000 : 3_600_000;
  const from = slotStartMs(start, granularity);
  const to = slotStartMs(end, granularity);
  const out: string[] = [];
  for (let t = from; t <= to; t += step) {
    out.push(new Date(t).toISOString());
  }
  return out;
}

function unboxKpiBucketKey(instant: Date, granularity: UnboxKpiGranularity): string {
  return new Date(slotStartMs(instant, granularity)).toISOString();
}

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

const ZERO_UNBOX_RECENT: UnboxRecentCounts = {
  total: 0,
  openedToday: 0,
  awaitingTest: 0,
  stuck: 0,
};

const ZERO_UNBOX_QUEUE: UnboxQueueCounts = {
  total: 0,
  priority: 0,
  oldestAgeHours: 0,
};

const ZERO_UNBOX_VIEWED: UnboxViewedCounts = {
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
function recentCounts(rows: ReceivingLineRow[]): UnboxRecentCounts {
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
function queueCounts(rows: ReceivingLineRow[], serverTotal?: number): UnboxQueueCounts {
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
function viewedCounts(rows: ReceivingLineRow[]): UnboxViewedCounts {
  const today = toPSTDateKey(new Date());
  let viewedToday = 0;
  let unfinished = 0;
  for (const row of rows) {
    if (isUnboxViewedToday(row, today)) viewedToday += 1;
    if (isUnboxUnfinished(row)) unfinished += 1;
  }
  return { total: rows.length, viewedToday, unfinished };
}

/** Row predicate for a clickable KPI tile, keyed by metric id + active tab — the same membership test… */
export function unboxKpiRowFilter(
  metricId: string | null | undefined,
  mode: UnboxWorkspaceTab,
): ((row: ReceivingLineRow) => boolean) | null {
  if (!metricId) return null;
  const today = toPSTDateKey(new Date());
  const feed = unboxKpiFeedTab(mode);
  if (feed === 'history') {
    if (metricId === 'awaiting-test') return isUnboxAwaitingTest;
    if (metricId === 'stuck') return isUnboxStuck;
    if (metricId === 'opened-today') return (row) => isUnboxOpenedToday(row, today);
  } else if (feed === 'queue') {
    if (metricId === 'priority') return isUnboxPriority;
  } else if (feed === 'recent') {
    if (metricId === 'unfinished') return isUnboxUnfinished;
    if (metricId === 'viewed-today') return (row) => isUnboxViewedToday(row, today);
  }
  return null;
}

/** Metric ids `unboxKpiRowFilter` can answer for a given tab — drives which tiles render as clickable. */
function isUnboxKpiFilterable(metricId: string, mode: UnboxWorkspaceTab): boolean {
  return unboxKpiRowFilter(metricId, mode) != null;
}

/**
 * Metric ids that ever write `?ukpi=` (clickable tiles). Informational tiles
 * (`queue-depth`, `oldest-wait`) never write the param — keep them out of the
 * hygiene allowlist so a hand-typed id cannot stick.
 */
export const UNBOX_KPI_FILTER_WIRE_IDS = [
  'opened-today',
  'awaiting-test',
  'stuck',
  'priority',
  'viewed-today',
  'unfinished',
] as const;

const UNBOX_KPI_FILTER_LABELS: Record<(typeof UNBOX_KPI_FILTER_WIRE_IDS)[number], string> = {
  'opened-today': 'Opened today',
  'awaiting-test': 'Awaiting test',
  stuck: 'Stuck / error',
  priority: 'Priority',
  'viewed-today': 'Viewed today',
  unfinished: 'Unfinished',
};

/** Face for a `?ukpi=` facet in the DataTable funnel. */
export function unboxKpiFilterLabel(id: string): string {
  return UNBOX_KPI_FILTER_LABELS[id as keyof typeof UNBOX_KPI_FILTER_LABELS] ?? id;
}

/** Wire tokens `?ukpi=` may carry (route-param hygiene). */
export function parseUnboxKpiFilterWire(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  return (UNBOX_KPI_FILTER_WIRE_IDS as readonly string[]).includes(key) ? key : null;
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

function resolveUnboxMetrics(ctx: UnboxMetricContext): ComputedMetric[] {
  return UNBOX_METRICS.filter((definition) => definition.modes.includes(ctx.mode))
    .map((definition) => definition.compute(ctx))
    .filter((value): value is ComputedMetric => value != null);
}

function splitUnboxAttention(metrics: ComputedMetric[]) {
  return {
    attention: metrics.filter((m) => m.severity >= 2),
    rest: metrics.filter((m) => m.severity < 2),
  };
}

// ── Band 2 canvas cards (series + breakdown) ─────────────────────────────────

function rowActivityAt(row: ReceivingLineRow, mode: UnboxWorkspaceTab): Date | null {
  const raw =
    mode === 'queue'
      ? row.scanned_at ?? row.received_at ?? row.created_at
      : mode === 'recent'
        ? (row as ReceivingLineRow & { viewed_at?: string | null }).viewed_at ??
          row.last_activity_at ??
          row.updated_at ??
          row.created_at
        : row.unboxed_at ?? row.unbox_opened_at ?? row.last_activity_at ?? row.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

function inWindow(at: Date | null, start: Date, end: Date): boolean {
  if (!at) return false;
  const t = at.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function seriesFromMatches(
  buckets: string[],
  granularity: UnboxKpiGranularity,
  matches: Date[],
): UnboxKpiSeriesPoint[] {
  const counts = new Map<string, number>();
  for (const b of buckets) counts.set(b, 0);
  for (const at of matches) {
    const key = unboxKpiBucketKey(at, granularity);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return buckets.map((at) => ({ at, value: counts.get(at) ?? 0 }));
}

function cardFromMetric(
  metric: ComputedMetric,
  mode: UnboxWorkspaceTab,
  series: UnboxKpiSeriesPoint[],
  breakdown: UnboxKpiBreakdown[],
): UnboxKpiMetricCard {
  return {
    id: metric.id,
    label: metric.label,
    value: metric.value,
    intent: metric.intent,
    severity: metric.severity,
    tooltip: metric.tooltip,
    series,
    breakdown,
    filterable: isUnboxKpiFilterable(metric.id, mode),
  };
}

/**
 * Build Band 2 KPI canvas cards from source rows + a time window.
 * Scalars reuse {@link resolveUnboxMetrics}; series/breakdowns share the same
 * predicates as {@link unboxKpiRowFilter}.
 */
export function buildUnboxKpiCards(args: {
  mode: UnboxWorkspaceTab;
  rows: ReceivingLineRow[];
  range: UnboxKpiRange;
  serverTotal?: number;
  now?: Date;
}): {
  metrics: UnboxKpiMetricCard[];
  range: UnboxKpiRange;
  granularity: UnboxKpiGranularity;
} {
  const now = args.now ?? new Date();
  const { start, end, granularity } = unboxKpiRangeWindow(args.range, now);
  const buckets = fillUnboxKpiBuckets(start, end, granularity);

  const feed = unboxKpiFeedTab(args.mode);
  const queue = feed === 'queue' ? queueCounts(args.rows, args.serverTotal) : ZERO_UNBOX_QUEUE;
  const recent = feed === 'history' ? recentCounts(args.rows) : ZERO_UNBOX_RECENT;
  const viewed = feed === 'recent' ? viewedCounts(args.rows) : ZERO_UNBOX_VIEWED;
  const scalars = resolveUnboxMetrics({ mode: feed, queue, recent, viewed });

  const windowRows = args.rows.filter((row) =>
    inWindow(rowActivityAt(row, feed), start, end),
  );

  const metrics = scalars.map((metric) => {
    const predicate = unboxKpiRowFilter(metric.id, feed);
    const matchDates: Date[] = [];
    if (metric.id !== 'oldest-wait') {
      for (const row of windowRows) {
        if (predicate) {
          if (!predicate(row)) continue;
        } else if (metric.id !== 'queue-depth') {
          continue;
        }
        const at = rowActivityAt(row, feed);
        if (at) matchDates.push(at);
      }
    }
    const series =
      metric.id === 'oldest-wait'
        ? buckets.map((at) => ({ at, value: 0 }))
        : seriesFromMatches(buckets, granularity, matchDates);

    let breakdown: UnboxKpiBreakdown[] = [];
    if (metric.id === 'priority') {
      const pri = args.rows.filter(isUnboxPriority).length;
      const rest = Math.max(0, queue.total - pri);
      breakdown = [
        { key: 'priority', label: 'Priority', value: pri },
        { key: 'standard', label: 'Standard', value: rest },
      ].filter((b) => b.value > 0);
    } else if (metric.id === 'stuck') {
      const stuck = args.rows.filter(isUnboxStuck).length;
      const rest = Math.max(0, args.rows.length - stuck);
      breakdown = [
        { key: 'stuck', label: 'Stuck / error', value: stuck },
        { key: 'clear', label: 'Clear', value: rest },
      ].filter((b) => b.value > 0);
    } else if (metric.id === 'awaiting-test') {
      const awaiting = args.rows.filter(isUnboxAwaitingTest).length;
      const rest = Math.max(0, args.rows.length - awaiting);
      breakdown = [
        { key: 'awaiting-test', label: 'Awaiting test', value: awaiting },
        { key: 'other', label: 'Other', value: rest },
      ].filter((b) => b.value > 0);
    } else if (metric.id === 'unfinished') {
      const unfinished = args.rows.filter(isUnboxUnfinished).length;
      const rest = Math.max(0, args.rows.length - unfinished);
      breakdown = [
        { key: 'unfinished', label: 'Unfinished', value: unfinished },
        { key: 'done', label: 'Finished', value: rest },
      ].filter((b) => b.value > 0);
    } else if (metric.id === 'queue-depth') {
      const pri = args.rows.filter(isUnboxPriority).length;
      const rest = Math.max(0, queue.total - pri);
      breakdown = [
        { key: 'priority', label: 'Priority', value: pri },
        { key: 'standard', label: 'Standard', value: rest },
      ].filter((b) => b.value > 0);
    } else if (
      metric.id === 'opened-today' ||
      metric.id === 'viewed-today'
    ) {
      const inRange = matchDates.length;
      const outside = Math.max(0, args.rows.length - inRange);
      breakdown = [
        { key: metric.id, label: metric.label, value: inRange },
        { key: 'other', label: 'Outside window', value: outside },
      ].filter((b) => b.value > 0);
    }

    return cardFromMetric(metric, args.mode, series, breakdown);
  });

  // Severity-first (same as splitUnboxAttention flatten).
  metrics.sort((a, b) => b.severity - a.severity || a.label.localeCompare(b.label));

  return { metrics, range: args.range, granularity };
}
