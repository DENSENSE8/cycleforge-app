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
import { STAFF_FILTER_PARAM, useStaffFilter } from '@/hooks/useStaffFilter';
import {
  resolveTestingMetrics,
  splitTestingAttention,
  ZERO_TESTING_HISTORY,
  ZERO_TESTING_QUEUE,
  type ComputedMetric,
  type TestingHistoryCounts,
  type TestingQueueCounts,
} from '@/lib/tech/testing-metrics';
import { TESTING_RECEIVING_LINES_API } from '@/lib/surface-isolation';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { TestingWorkspaceTab } from '@/utils/testing-workspace-state';
import { computeWeekRange, toPSTDateKey } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { WEEK_OFFSET_PARAM, parseWeekOffset } from '@/lib/station/table-url-params';

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
      <span className="sr-only">Loading testing metrics…</span>
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

function StripEmpty({ mode }: { mode: TestingWorkspaceTab }) {
  const copy =
    mode === 'pending'
      ? 'No standard intake is waiting for testing.'
      : mode === 'returns'
        ? 'No returns are waiting for quality control.'
        : 'No testing history is in this staff scope.';
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
      <p className="text-role-caption font-bold text-text-danger">Couldn&apos;t load testing metrics.</p>
      <Button variant="secondary" size="sm" onClick={onRetry} className="mt-2">
        <RefreshCw className="h-3.5 w-3.5" />
        Try again
      </Button>
    </div>
  );
}

function queueCounts(rows: ReceivingLineRow[], techId?: number): TestingQueueCounts {
  const now = Date.now();
  let oldest = 0;
  let assignedToMe = 0;
  let unassigned = 0;
  const platforms = new Set<string>();
  for (const row of rows) {
    if (techId != null && row.assigned_tech_id === techId) assignedToMe += 1;
    if (row.assigned_tech_id == null) unassigned += 1;
    const source = String(row.source_platform || '').trim().toLowerCase();
    if (source) platforms.add(source);
    const entered = row.last_activity_at ?? row.unbox_opened_at ?? row.unboxed_at ?? row.created_at;
    if (entered) {
      const age = Math.max(0, (now - new Date(entered).getTime()) / 3_600_000);
      if (Number.isFinite(age)) oldest = Math.max(oldest, age);
    }
  }
  return {
    total: rows.length,
    assignedToMe,
    unassigned,
    oldestAgeHours: oldest,
    platformCount: platforms.size,
  };
}

function historyCounts(
  rows: ReceivingLineRow[],
  week: ReturnType<typeof computeWeekRange>,
): TestingHistoryCounts {
  const today = toPSTDateKey(new Date());
  let todayTotal = 0;
  let weekTotal = 0;
  let failed = 0;
  let retest = 0;
  for (const row of rows) {
    const instant = row.last_activity_at ?? row.updated_at ?? row.created_at;
    let key = '';
    try {
      key = instant ? toPSTDateKey(instant) : '';
    } catch {
      key = '';
    }
    if (key === today) todayTotal += 1;
    const isThisWeek = key >= week.startStr && key <= week.endStr;
    if (isThisWeek) {
      weekTotal += 1;
      const outcome = `${row.workflow_status || ''} ${row.qa_status || ''}`.toUpperCase();
      if (outcome.includes('FAIL')) failed += 1;
      if ((row.tested_count ?? 0) > Math.max(1, row.quantity_received)) retest += 1;
    }
  }
  return { todayTotal, weekTotal, failed, retest };
}

export function TestingKpiStrip({
  mode,
  techId,
}: {
  mode: TestingWorkspaceTab;
  techId?: number;
}) {
  const searchParams = useSearchParams();
  const { staffId } = useStaffFilter({ allToken: 'all' });
  const allStaff =
    String(searchParams.get(STAFF_FILTER_PARAM) || '').trim().toLowerCase() === 'all';
  const historyTester = allStaff ? null : (staffId ?? techId ?? null);
  const queryTester = mode === 'history' ? historyTester : null;
  const search = String(searchParams.get('search') || '').trim();
  const weekOffset =
    mode === 'history'
      ? Math.max(0, parseWeekOffset(searchParams.get(WEEK_OFFSET_PARAM)))
      : 0;
  const weekRange = useMemo(() => computeWeekRange(weekOffset), [weekOffset]);

  const query = useQuery<ApiResponse>({
    // Exact key + request contract shared with TestingHistoryList: React Query
    // deduplicates the 500-row feed, then the table and KPI strip derive from
    // one cached response.
    queryKey: ['testing-workspace', mode, queryTester ?? 'all', search, weekOffset],
    enabled: mode !== 'history' || queryTester != null || allStaff,
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: '500',
        offset: '0',
        include: 'serials',
        view: mode === 'history' ? 'testing' : 'needs-test',
      });
      if (mode !== 'history') {
        params.set('return_scope', mode === 'returns' ? 'returns' : 'standard');
      } else if (queryTester != null) {
        params.set('tester', String(queryTester));
      }
      if (mode === 'history') {
        params.set('weekStart', weekRange.startStr);
        params.set('weekEnd', weekRange.endStr);
      }
      if (search) params.set('search', search);
      const response = await fetch(`${TESTING_RECEIVING_LINES_API}?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to load testing metrics');
      return response.json();
    },
    staleTime: 20_000,
  });

  const rows = useMemo(
    () => (Array.isArray(query.data?.receiving_lines) ? query.data.receiving_lines : []),
    [query.data],
  );
  const metrics = resolveTestingMetrics({
    mode,
    queue: mode === 'history' ? ZERO_TESTING_QUEUE : queueCounts(rows, techId),
    history: mode === 'history' ? historyCounts(rows, weekRange) : ZERO_TESTING_HISTORY,
  });
  const { attention, rest } = splitTestingAttention(metrics);
  const tiles = [...attention, ...rest];

  return (
    <section aria-label="Testing attention" className="shrink-0">
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
