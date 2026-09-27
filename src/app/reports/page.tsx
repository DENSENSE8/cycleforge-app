'use client';

/** `/reports` — stock, shift and task reports share one desk frame. */

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { DeskActionSlotRegistrar, DeskHeaderAction } from '@/design-system/components/DeskActionSlot';
import { DataTable } from '@/components/tables/DataTable';
import { useReportBinUtilizationSpreadsheet } from '@/components/reports/report-bin-utilization-grid/useReportBinUtilizationSpreadsheet';
import { useReportVelocitySpreadsheet } from '@/components/reports/report-velocity-grid/useReportVelocitySpreadsheet';
import { useReportDeadStockSpreadsheet } from '@/components/reports/report-dead-stock-grid/useReportDeadStockSpreadsheet';
import {
  parseBinUtilizationReportRows,
  parseDeadStockReportRows,
  parseVelocityReportRows,
  reportRouteFailure,
  type BinUtilizationReportRow,
  type DeadStockReportRow,
  type VelocityReportRow,
} from '@/lib/reports/report-rows';
import {
  staffDayRowsFromReport,
  type StaffDayReportRow,
} from '@/lib/reports/staff-day-rows';
import type { DailyCheckReport } from '@/lib/daily-checks/types';
import { addDaysToDateKey, formatDateKeyMedium, getCurrentPSTDateKey } from '@/utils/date';
import { useReportStaffDaySpreadsheet } from '@/components/reports/report-staff-day-grid/useReportStaffDaySpreadsheet';
import { useReportPackerDaySpreadsheet } from '@/components/reports/report-packer-day-grid/useReportPackerDaySpreadsheet';
import type { PackingReportRow } from '@/lib/packing/packing-report-shared';
import { useReportTasksSpreadsheet } from '@/components/reports/report-tasks-grid/useReportTasksSpreadsheet';
import { parseTaskDeskReportRows } from '@/lib/reports/report-tasks-feed';
import type { TaskDeskRow } from '@/lib/tasks/task-desk-row';

import { TaskActivityReport } from '@/components/reports/TaskActivityReport';
import { REPORT_TABS as TABS, parseReportTab, type ReportTab as Tab } from '@/lib/reports/report-tabs';

/** Unchanged route + limit per tab — the day-scoped and task tabs read below. */
const REPORT_URLS: Readonly<Record<Exclude<Tab, 'staff' | 'packer' | 'tasks' | 'activity'>, string>> = {
  utilization: '/api/reports/bin-utilization?limit=500',
  velocity: '/api/reports/velocity?limit=200',
  dead: '/api/reports/dead-stock?limit=500',
};

/** The finished half of the task desk's own lane vocabulary — `lane=done` is `taskDeskLaneStatuses('done')` (status `DONE`; a withdrawn… */
const TASKS_REPORT_URL = '/api/tasks?lane=done&assignee=all&limit=200';

/** Which tabs ANSWER the find text at the server (`?q=`), and therefore ride it on their fetch instead of filtering the page in hand. */
const FIND_ANSWERED_BY_SERVER: Readonly<Record<Tab, boolean>> = {
  staff: false,
  packer: false,
  utilization: true,
  velocity: false,
  dead: false,
  tasks: true,
  activity: false,
};

/** `base` + the find text, for the tabs whose route answers it. */
function withFind(base: string, tab: Tab, find: string): string {
  const q = find.trim();
  return FIND_ANSWERED_BY_SERVER[tab] && q ? `${base}&q=${encodeURIComponent(q)}` : base;
}

/** One fetched report page, TAGGED with the tab that asked for it. */
type ReportFeed =
  | { tab: 'staff'; rows: readonly StaffDayReportRow[]; dateKey: string }
  | { tab: 'packer'; rows: readonly PackingReportRow[]; dateKey: string }
  | { tab: 'utilization'; rows: readonly BinUtilizationReportRow[] }
  | { tab: 'velocity'; rows: readonly VelocityReportRow[] }
  | { tab: 'dead'; rows: readonly DeadStockReportRow[] }
  | { tab: 'tasks'; rows: readonly TaskDeskRow[] };

/** Shared empty page — a fresh `[]` per render would rebuild every row memo. */
const NO_ROWS: readonly never[] = [];

async function fetchReportFeed(tab: Exclude<Tab, 'activity'>, dateKey: string, find: string): Promise<ReportFeed> {
  // The staff tab is a different SOURCE, not a fourth REST shape: the
  // daily-check report the phone already reads, flattened by the projection
  // both surfaces share — one truth, two presentations.
  if (tab === 'staff') {
    const res = await fetch(`/api/daily-checks?date=${encodeURIComponent(dateKey)}&scope=all`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return {
      tab,
      rows: staffDayRowsFromReport((await res.json()) as DailyCheckReport),
      dateKey,
    };
  }
  /* Packer day reads the SAME endpoint as the phone's Packing tab (`/m/reports`) and its CSV export — `format=json` on the export route — so… */
  if (tab === 'packer') {
    const res = await fetch(
      `/api/packing/reports/export?format=json&day=${encodeURIComponent(dateKey)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { ok?: boolean; rows?: PackingReportRow[]; error?: string };
    if (body.ok === false) throw new Error(body.error || 'packing report failed');
    return { tab, rows: body.rows ?? [], dateKey };
  }
  /* Completed tasks read the task desk's OWN route, not a `/api/reports/*` sibling: */
  if (tab === 'tasks') {
    const res = await fetch(withFind(TASKS_REPORT_URL, tab, find), { cache: 'no-store' });
    const body: unknown = await res.json();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { tab, rows: parseTaskDeskReportRows(body) };
  }
  const res = await fetch(withFind(REPORT_URLS[tab], tab, find), { cache: 'no-store' });
  const payload: unknown = await res.json();
  const failure = reportRouteFailure(payload);
  if (!res.ok || failure) throw new Error(failure ?? `HTTP ${res.status}`);
  if (tab === 'utilization') {
    return { tab, rows: parseBinUtilizationReportRows(payload) };
  }
  if (tab === 'velocity') {
    return { tab, rows: parseVelocityReportRows(payload) };
  }
  return { tab, rows: parseDeadStockReportRows(payload) };
}

/** What a SERVER-ANSWERED find hands its table: */
interface ServerFind {
  find: string;
  onFindChange: (next: string) => void;
  finding: boolean;
}

function BinUtilizationReportTable({
  rows,
  loading,
  find,
  onFindChange,
  finding,
}: {
  rows: readonly BinUtilizationReportRow[];
  loading: boolean;
} & ServerFind) {
  const sheet = useReportBinUtilizationSpreadsheet({
    rows,
    loading,
    searchValue: find,
    onSearchChange: onFindChange,
    searchPending: finding,
  });
  return <DataTable {...sheet} totalCount={rows.length} />;
}

function VelocityReportTable({
  rows,
  loading,
}: {
  rows: readonly VelocityReportRow[];
  loading: boolean;
}) {
  const sheet = useReportVelocitySpreadsheet({ rows, loading });
  return <DataTable {...sheet} totalCount={rows.length} />;
}

function DeadStockReportTable({
  rows,
  loading,
}: {
  rows: readonly DeadStockReportRow[];
  loading: boolean;
}) {
  const sheet = useReportDeadStockSpreadsheet({ rows, loading });
  return <DataTable {...sheet} totalCount={rows.length} />;
}

/** Completed tasks — one row per finished follow-up, EVERY staffer's. */
function TasksReportTable({
  rows,
  loading,
  find,
  onFindChange,
  finding,
}: {
  rows: readonly TaskDeskRow[];
  loading: boolean;
} & ServerFind) {
  const sheet = useReportTasksSpreadsheet({
    rows,
    loading,
    searchValue: find,
    onSearchChange: onFindChange,
    searchPending: finding,
  });
  const late = rows.filter(
    (r) => r.deadlineAtMs !== null && r.completedAtMs !== null && r.completedAtMs > r.deadlineAtMs,
  ).length;
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col">
        <DataTable {...sheet} totalCount={rows.length} />
      </div>
      {rows.length > 0 ? (
        <p className="px-3 pt-2 text-role-micro text-text-soft">
          Every staffer&apos;s finished tasks · {rows.length}{' '}
          {rows.length === 1 ? 'task' : 'tasks'}
          {late > 0 ? ` · ${late} landed after the deadline` : ''}. The date column reads when
          the task landed over the day it was promised for.
        </p>
      ) : null}
    </section>
  );
}

/** The day walk, shared by every DAY-SCOPED tab. */
function ReportDayStepper({
  dateKey,
  onDateChange,
}: {
  dateKey: string;
  onDateChange: (next: string) => void;
}) {
  const today = getCurrentPSTDateKey();
  return (
    <div className="flex items-center justify-center gap-2 pb-2">
      <DeskHeaderAction
        variant="secondary"
        size="sm"
        type="button"
        onClick={() => onDateChange(addDaysToDateKey(dateKey, -1))}
      >
        ‹ Earlier
      </DeskHeaderAction>
      <span className="min-w-40 text-center text-sm font-semibold text-text-default">
        {dateKey === today ? 'Today' : formatDateKeyMedium(dateKey, { weekday: 'short' })}
      </span>
      <DeskHeaderAction
        variant="secondary"
        size="sm"
        type="button"
        disabled={dateKey >= today}
        onClick={() => onDateChange(addDaysToDateKey(dateKey, 1))}
      >
        Later ›
      </DeskHeaderAction>
    </div>
  );
}

function StaffDayReportTable({
  rows,
  loading,
  dateKey,
  onDateChange,
}: {
  rows: readonly StaffDayReportRow[];
  loading: boolean;
  dateKey: string;
  onDateChange: (next: string) => void;
}) {
  const sheet = useReportStaffDaySpreadsheet({ rows, loading });
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ReportDayStepper dateKey={dateKey} onDateChange={onDateChange} />
      <div className="flex min-h-0 flex-1 flex-col">
        <DataTable {...sheet} totalCount={rows.length} />
      </div>
    </section>
  );
}

/** Packer day — one row per pack, for one PST day. */
function PackerDayReportTable({
  rows,
  loading,
  dateKey,
  onDateChange,
}: {
  rows: readonly PackingReportRow[];
  loading: boolean;
  dateKey: string;
  onDateChange: (next: string) => void;
}) {
  const sheet = useReportPackerDaySpreadsheet({ rows, loading });
  const totalMinutes = rows.reduce((sum, r) => sum + r.estimatedMinutes, 0);
  const unpaired = rows.filter((r) => !r.sku).length;
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ReportDayStepper dateKey={dateKey} onDateChange={onDateChange} />
      <div className="flex min-h-0 flex-1 flex-col">
        <DataTable {...sheet} totalCount={rows.length} />
      </div>
      {rows.length > 0 ? (
        <p className="px-3 pt-2 text-role-micro text-text-soft">
          {rows.length} {rows.length === 1 ? 'pack' : 'packs'} · {totalMinutes.toLocaleString()}{' '}
          standard minutes
          {unpaired > 0
            ? ` · ${unpaired} not paired to a catalog SKU, carrying the fallback standard`
            : ''}
          . Time to pack is each SKU&apos;s standard × packs, not a measured pace.
        </p>
      ) : null}
    </section>
  );
}

/** Which family MOUNTS — never which column set a shared host receives. */
function ReportBody({
  tab,
  feed,
  loading,
  dateKey,
  onDateChange,
  find,
  onFindChange,
  finding,
}: {
  tab: Tab;
  feed: ReportFeed | null;
  loading: boolean;
  dateKey: string;
  onDateChange: (next: string) => void;
} & ServerFind) {
  if (tab === 'activity') {
    return (
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ReportDayStepper dateKey={dateKey} onDateChange={onDateChange} />
        <TaskActivityReport dateKey={dateKey} />
      </section>
    );
  }
  if (tab === 'staff') {
    return (
      <StaffDayReportTable
        rows={feed?.tab === 'staff' ? feed.rows : NO_ROWS}
        loading={loading}
        dateKey={dateKey}
        onDateChange={onDateChange}
      />
    );
  }
  if (tab === 'packer') {
    return (
      <PackerDayReportTable
        rows={feed?.tab === 'packer' ? feed.rows : NO_ROWS}
        loading={loading}
        dateKey={dateKey}
        onDateChange={onDateChange}
      />
    );
  }
  if (tab === 'utilization') {
    return (
      <BinUtilizationReportTable
        rows={feed?.tab === 'utilization' ? feed.rows : NO_ROWS}
        loading={loading}
        find={find}
        onFindChange={onFindChange}
        finding={finding}
      />
    );
  }
  if (tab === 'velocity') {
    return (
      <VelocityReportTable
        rows={feed?.tab === 'velocity' ? feed.rows : NO_ROWS}
        loading={loading}
      />
    );
  }
  if (tab === 'tasks') {
    return (
      <TasksReportTable
        rows={feed?.tab === 'tasks' ? feed.rows : NO_ROWS}
        loading={loading}
        find={find}
        onFindChange={onFindChange}
        finding={finding}
      />
    );
  }
  return (
    <DeadStockReportTable
      rows={feed?.tab === 'dead' ? feed.rows : NO_ROWS}
      loading={loading}
    />
  );
}

function ReportsPageInner() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  /* URL-ADDRESSABLE tabs and date (Track R1): */
  const tab: Tab = parseReportTab(searchParams.get('tab')) ?? 'staff';
  const dateParam = searchParams.get('date');
  const dateKey = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : getCurrentPSTDateKey();

  /* The find text is SESSION-LOCAL and rides the FETCH KEY — it is deliberately NOT a third URL param. */
  const [find, setFind] = useState('');

  const setParams = useCallback(
    (next: { tab?: Tab; date?: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.tab) params.set('tab', next.tab);
      if (next.date) params.set('date', next.date);
      if (next.tab && next.tab !== tab) setFind('');
      router.replace(`/reports?${params.toString()}`, { scroll: false });
    },
    [router, searchParams, tab],
  );

  const [feed, setFeed] = useState<ReportFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // `find` is part of the fetch KEY, not a filter applied after it: for the
  // tabs in `FIND_ANSWERED_BY_SERVER` the rows that come back ARE the answer.
  const load = useCallback(async () => {
    if (tab === 'activity') {
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setFeed(await fetchReportFeed(tab, dateKey, find));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [tab, dateKey, find]);
  useEffect(() => {
    load();
  }, [load]);

  /* The desk frame, not a second one (2026-08-31). */
  return (
    <DeskPageLayout
      title="Reports"
      tabs={TABS}
      activeTab={tab}
      onTabChange={(id) => setParams({ tab: id as Tab })}
      className="h-full"
    >
      <DeskActionSlotRegistrar>
        <DeskHeaderAction
          variant="secondary"
          size="md"
          type="button"
          onClick={() => {
            if (tab === 'activity') void queryClient.invalidateQueries({ queryKey: ['task-activity-report', dateKey] });
            else void load();
          }}
        >
          Refresh
        </DeskHeaderAction>
      </DeskActionSlotRegistrar>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col px-3 py-3">
        {error && tab !== 'activity' && (
          <p className="px-3 py-6 text-center text-sm font-semibold text-rose-600">{error}</p>
        )}
        {(!error || tab === 'activity') && (
          <ReportBody
            tab={tab}
            feed={feed}
            loading={loading}
            dateKey={dateKey}
            onDateChange={(d) => setParams({ date: d })}
            find={find}
            onFindChange={setFind}
            finding={loading}
          />
        )}
      </main>
    </DeskPageLayout>
  );
}

export default function ReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center bg-surface-canvas">
          <LoadingSpinner size="lg" className="text-blue-600" />
        </div>
      }
    >
      <ReportsPageInner />
    </Suspense>
  );
}
