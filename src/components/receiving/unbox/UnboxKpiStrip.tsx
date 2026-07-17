'use client';

import { useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  KpiTile,
  metricIntentTextClass,
  MONITOR_KPI_TILE_CLASS,
} from '@/design-system/components/monitor';
import { Button } from '@/design-system/primitives';
import { CheckCircle, RefreshCw } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { parseStaffParam } from '@/hooks/useStaffFilter';
import {
  resolveUnboxMetrics,
  splitUnboxAttention,
  ZERO_UNBOX_QUEUE,
  ZERO_UNBOX_RECENT,
  ZERO_UNBOX_VIEWED,
  type ComputedMetric,
  type UnboxQueueCounts,
  type UnboxRecentCounts,
  type UnboxViewedCounts,
} from '@/lib/receiving/unbox-metrics';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { UnboxWorkspaceTab } from '@/utils/unbox-workspace-state';
import { toPSTDateKey } from '@/utils/date';
import { cn } from '@/utils/_cn';

const TILE_BAND_CLASS = 'flex flex-wrap gap-3';
const TILE_CELL_CLASS = 'min-w-0 grow basis-40';

interface ApiResponse {
  success: boolean;
  receiving_lines: ReceivingLineRow[];
}

function MetricKpiTile({ metric }: { metric: ComputedMetric }) {
  const tone = metricIntentTextClass(metric.intent);
  const footer: ReactNode = metric.status ? (
    <span
      className={cn(
        'mt-1.5 inline-flex items-center gap-1.5 text-role-eyebrow font-semibold uppercase tracking-widest',
        tone,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {metric.status}
    </span>
  ) : undefined;
  const tile = (
    <KpiTile
      label={metric.label}
      value={metric.value}
      valueClassName={metric.intent === 'warn' || metric.intent === 'bad' ? tone : undefined}
      footer={footer}
      className="h-full"
    />
  );
  return metric.tooltip ? (
    <HoverTooltip label={metric.tooltip} focusable className="block h-full">
      {tile}
    </HoverTooltip>
  ) : (
    tile
  );
}

function StripSkeleton() {
  return (
    <div className={cn(TILE_BAND_CLASS, 'animate-pulse')} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading unbox metrics…</span>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className={cn(MONITOR_KPI_TILE_CLASS, TILE_CELL_CLASS, 'h-24')}>
          <div className="h-2.5 w-16 rounded-full bg-surface-strong" />
          <div className="mt-2 h-7 w-14 rounded bg-surface-strong" />
          <div className="mt-2.5 h-2.5 w-20 rounded-full bg-surface-strong" />
        </div>
      ))}
    </div>
  );
}

function StripEmpty({ mode }: { mode: UnboxWorkspaceTab }) {
  const copy =
    mode === 'queue'
      ? 'No door-scanned cartons are waiting to unbox.'
      : mode === 'viewed'
        ? 'You have not opened any lines yet.'
        : 'No cartons have been opened on Unbox yet.';
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-border-soft bg-surface-card px-4 py-5">
      <CheckCircle className="h-5 w-5 shrink-0 text-text-success" />
      <div className="min-w-0">
        <p className="text-role-caption font-bold text-text-default">All clear.</p>
        <p className="mt-0.5 text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
          {copy}
        </p>
      </div>
    </div>
  );
}

function StripError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border-danger bg-fill-danger px-4 py-8 text-center">
      <p className="text-role-caption font-bold text-text-danger">Couldn&apos;t load unbox metrics.</p>
      <Button variant="secondary" size="sm" onClick={onRetry} className="mt-2">
        <RefreshCw className="h-3.5 w-3.5" />
        Try again
      </Button>
    </div>
  );
}

function isStuck(row: ReceivingLineRow): boolean {
  const status = `${row.workflow_status || ''} ${row.qa_status || ''}`.toUpperCase();
  return status.includes('ERROR') || status.includes('BLOCK') || status.includes('STUCK');
}

function isAwaitingTest(row: ReceivingLineRow): boolean {
  const status = String(row.workflow_status || '').toUpperCase();
  return status === 'AWAITING_TEST' || status === 'UNBOXED';
}

function isPriority(row: ReceivingLineRow): boolean {
  if (row.is_priority === true) return true;
  if (typeof row.priority_tier === 'number' && row.priority_tier === 0) return true;
  const lane = String(row.priority_lane || '').toLowerCase();
  return lane === 'priority' || lane === 'expedited' || lane === 'high';
}

function isUnfinished(row: ReceivingLineRow): boolean {
  const status = String(row.workflow_status || '').toUpperCase();
  return status !== 'DONE' && status !== 'RECEIVED' && status !== 'COMPLETE';
}

function recentCounts(rows: ReceivingLineRow[]): UnboxRecentCounts {
  const today = toPSTDateKey(new Date());
  let openedToday = 0;
  let awaitingTest = 0;
  let stuck = 0;
  for (const row of rows) {
    const instant = row.unboxed_at ?? row.unbox_opened_at ?? row.scanned_at ?? row.created_at;
    let key = '';
    try {
      key = instant ? toPSTDateKey(instant) : '';
    } catch {
      key = '';
    }
    if (key === today) openedToday += 1;
    if (isAwaitingTest(row)) awaitingTest += 1;
    if (isStuck(row)) stuck += 1;
  }
  return { total: rows.length, openedToday, awaitingTest, stuck };
}

function queueCounts(rows: ReceivingLineRow[]): UnboxQueueCounts {
  const now = Date.now();
  let oldest = 0;
  let priority = 0;
  for (const row of rows) {
    if (isPriority(row)) priority += 1;
    const entered = row.scanned_at ?? row.received_at ?? row.created_at;
    if (entered) {
      const age = Math.max(0, (now - new Date(entered).getTime()) / 3_600_000);
      if (Number.isFinite(age)) oldest = Math.max(oldest, age);
    }
  }
  return { total: rows.length, priority, oldestAgeHours: oldest };
}

function viewedCounts(rows: ReceivingLineRow[]): UnboxViewedCounts {
  const today = toPSTDateKey(new Date());
  let viewedToday = 0;
  let unfinished = 0;
  for (const row of rows) {
    const instant =
      (row as ReceivingLineRow & { viewed_at?: string | null }).viewed_at ??
      row.last_activity_at ??
      row.updated_at ??
      row.created_at;
    let key = '';
    try {
      key = instant ? toPSTDateKey(instant) : '';
    } catch {
      key = '';
    }
    if (key === today) viewedToday += 1;
    if (isUnfinished(row)) unfinished += 1;
  }
  return { total: rows.length, viewedToday, unfinished };
}

function viewForTab(mode: UnboxWorkspaceTab): string {
  if (mode === 'queue') return 'scanned';
  if (mode === 'viewed') return 'viewed';
  return 'unbox_opened';
}

export function UnboxKpiStrip({ mode }: { mode: UnboxWorkspaceTab }) {
  const searchParams = useSearchParams();
  const staffId = parseStaffParam(searchParams.get('staff') ?? searchParams.get('staffId'));

  const query = useQuery<ApiResponse>({
    queryKey: ['unbox-workspace-metrics', mode, staffId ?? 'all'],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: '200',
        offset: '0',
        include: 'serials',
        view: viewForTab(mode),
      });
      if (mode === 'queue') params.set('sort', 'priority');
      if (staffId != null && mode !== 'viewed') params.set('staff', String(staffId));
      const response = await fetch(`/api/receiving-lines?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Failed to load unbox metrics');
      return response.json();
    },
    staleTime: 20_000,
  });

  const rows = useMemo(
    () => (Array.isArray(query.data?.receiving_lines) ? query.data.receiving_lines : []),
    [query.data],
  );

  const metrics = resolveUnboxMetrics({
    mode,
    recent: mode === 'recent' ? recentCounts(rows) : ZERO_UNBOX_RECENT,
    queue: mode === 'queue' ? queueCounts(rows) : ZERO_UNBOX_QUEUE,
    viewed: mode === 'viewed' ? viewedCounts(rows) : ZERO_UNBOX_VIEWED,
  });
  const { attention, rest } = splitUnboxAttention(metrics);
  const tiles = [...attention, ...rest];

  return (
    <section aria-label="Unbox attention" className="shrink-0">
      {query.isError ? (
        <StripError onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <StripSkeleton />
      ) : tiles.length === 0 ? (
        <StripEmpty mode={mode} />
      ) : (
        <div className={TILE_BAND_CLASS}>
          {tiles.map((metric) => (
            <div key={metric.id} className={TILE_CELL_CLASS}>
              <MetricKpiTile metric={metric} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
