'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  KpiTile,
  metricIntentTextClass,
  OpsKpiBand,
  OpsKpiBandCell,
  OpsKpiBandEmpty,
  OpsKpiBandError,
  OpsKpiBandSkeletonTile,
} from '@/design-system/components/monitor';
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
import {
  buildTestingWorkspaceSearchParams,
  resolveTestingWorkspaceTesterId,
  testingWorkspaceEmptyCopy,
  testingWorkspaceQueryKey,
} from '@/lib/tech/testing-workspace-query';
import { TESTING_RECEIVING_LINES_API } from '@/lib/surface-isolation';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { TestingWorkspaceTab } from '@/utils/testing-workspace-state';
import { computeWeekRange, toPSTDateKey } from '@/utils/date';
import { WEEK_OFFSET_PARAM, parseWeekOffset } from '@/lib/station/table-url-params';

interface ApiResponse {
  success: boolean;
  receiving_lines: ReceivingLineRow[];
}

function MetricKpiTile({ metric }: { metric: ComputedMetric }) {
  const tone = metricIntentTextClass(metric.intent);
  const tile = (
    <KpiTile
      density="band"
      label={metric.label}
      value={metric.value}
      valueClassName={metric.intent === 'warn' || metric.intent === 'bad' ? tone : undefined}
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
    <OpsKpiBand density="band" className="animate-pulse" aria-label="Loading testing metrics">
      <span className="sr-only">Loading testing metrics…</span>
      {Array.from({ length: 3 }).map((_, index) => (
        <OpsKpiBandCell key={index} density="band">
          <OpsKpiBandSkeletonTile density="band" />
        </OpsKpiBandCell>
      ))}
    </OpsKpiBand>
  );
}

function StripEmpty({
  mode,
  testerId,
  ownTesterId,
  explicitlyAll,
}: {
  mode: TestingWorkspaceTab;
  testerId: number | null;
  ownTesterId: number | null;
  explicitlyAll: boolean;
}) {
  const copy = testingWorkspaceEmptyCopy({
    mode,
    testerId,
    ownTesterId,
    explicitlyAll,
  });
  return (
    <OpsKpiBandEmpty density="band" title="All clear." description={copy} />
  );
}

function StripError({ onRetry }: { onRetry: () => void }) {
  return (
    <OpsKpiBandError
      density="band"
      message="Couldn't load testing metrics."
      onRetry={onRetry}
    />
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
  const explicitlyAll =
    String(searchParams.get(STAFF_FILTER_PARAM) || '').trim().toLowerCase() === 'all';
  const ownTesterId =
    techId != null && Number.isFinite(techId) && techId > 0 ? techId : null;
  const queryTester = resolveTestingWorkspaceTesterId({
    mode,
    filteredStaffId: staffId,
    ownTesterId,
    explicitlyAll,
  });
  const search = String(searchParams.get('search') || '').trim();
  const priorityOnly = mode === 'urgent';
  const weekOffset =
    mode === 'history'
      ? Math.max(0, parseWeekOffset(searchParams.get(WEEK_OFFSET_PARAM)))
      : 0;
  const weekRange = useMemo(() => computeWeekRange(weekOffset), [weekOffset]);

  const query = useQuery<ApiResponse>({
    // Exact key + request contract shared with TestingHistoryList: React Query
    // deduplicates the 500-row feed, then the table and KPI strip derive from
    // one cached response.
    queryKey: testingWorkspaceQueryKey({
      mode,
      testerId: queryTester,
      search,
      weekOffset,
      priorityOnly,
    }),
    enabled: mode !== 'history' || queryTester != null || explicitlyAll,
    queryFn: async () => {
      const params = buildTestingWorkspaceSearchParams({
        mode,
        testerId: queryTester,
        search,
        weekStart: weekRange.startStr,
        weekEnd: weekRange.endStr,
      });
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
        <StripEmpty
          mode={mode}
          testerId={queryTester}
          ownTesterId={ownTesterId}
          explicitlyAll={explicitlyAll}
        />
      ) : (
        <OpsKpiBand density="band" aria-label="Testing attention metrics">
          {tiles.map((metric) => (
            <OpsKpiBandCell key={metric.id} density="band">
              <MetricKpiTile metric={metric} />
            </OpsKpiBandCell>
          ))}
        </OpsKpiBand>
      )}
    </section>
  );
}
