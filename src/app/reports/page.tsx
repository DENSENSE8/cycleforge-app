'use client';

/**
 * `/reports` — three reports, three REGISTERED FAMILIES, one engine.
 *
 * Off `AdminTable` 2026-09-12 (Wave D). The page carried three hand-written
 * `AdminTableColumn[]` literals (`UTILIZATION_COLUMNS`, `VELOCITY_COLUMNS`,
 * `DEAD_COLUMNS`) over rows typed `Record<string, unknown>`, plus a
 * `ReportTable` component that chose which column set to hand the second
 * engine per tab. All five are gone:
 *
 * - the row type is real and narrowed at the `fetch` boundary
 *   (`@/lib/reports/report-rows`);
 * - the columns are materialized from each family's slot layout;
 * - `ReportTable` is replaced by three mounts, one per family, and the tab
 *   chooses which COMPONENT renders. A single host taking three column arrays
 *   is the fork this port removed — it is what let three unrelated row shapes
 *   share one table's identity, and why none of them could have a Fields menu.
 *
 * ## Why three tableIds and not one `reports` table
 *
 * A layout document binds catalog FACTS into slots, and these three reports
 * have no facts in common — a bin's fill ratio, a SKU's 30-day out quantity
 * and a SKU's dormancy count are three vocabularies over three row shapes. One
 * shared id would mean one document, so binding a column on Velocity would
 * bind a field Bin utilization cannot resolve.
 *
 * The consequence is the feature the retired desk could never have: the Fields
 * menu keys off `tableId`, and each family mounts its own, so switching tab
 * switches the picker, the org column layout and the staff widths with it —
 * automatically, with no per-tab branch anywhere in this file.
 *
 * Sort and search are LOCAL state per family (see each `use*Spreadsheet`
 * docblock): this page owns no search params, so a `?sort=` would round-trip a
 * URL nothing else reads.
 */

import { Suspense, useCallback, useEffect, useState } from 'react';
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

type Tab = 'staff' | 'packer' | 'utilization' | 'velocity' | 'dead' | 'tasks';

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'staff', label: 'Staff day' },
  /*
   * Packer day arrived 2026-09-16 when `/operations?mode=analytics` was
   * retired. It is a DAY-scoped report like Staff day, which is why it sits
   * beside it rather than at the end with the three SKU families.
   */
  { id: 'packer', label: 'Packer day' },
  { id: 'utilization', label: 'Bin Utilization' },
  { id: 'velocity', label: 'Velocity (30d)' },
  { id: 'dead', label: 'Dead Stock (90d+)' },
  /*
   * Completed tasks arrived 2026-09-22 with the `work_assignments` task desk.
   * It sits last because it is the only tab that is not about stock or a
   * shift: it is the record one staffer's finished follow-ups leave behind.
   */
  { id: 'tasks', label: 'Tasks' },
];

/** Unchanged route + limit per tab — the day-scoped and task tabs read below. */
const REPORT_URLS: Readonly<Record<Exclude<Tab, 'staff' | 'packer' | 'tasks'>, string>> = {
  utilization: '/api/reports/bin-utilization?limit=500',
  velocity: '/api/reports/velocity?limit=200',
  dead: '/api/reports/dead-stock?limit=500',
};

/**
 * The finished half of the task desk's own lane vocabulary — `lane=done` is
 * `taskDeskLaneStatuses('done')` (status `DONE`; a withdrawn task shows only
 * in `lane=all`), not a filter this page invented.
 *
 * `assignee=all` is EXPLICIT because the route defaults to the caller, and a
 * report that silently showed only the reader's own finished work would be a
 * personal record wearing a manager's page. Every other tab here is org-wide —
 * Staff day reads `scope=all`, Packer day reads every packer — and this one
 * answers the same kind of question: what did the floor finish, and was it
 * finished by the day it was promised for.
 */
const TASKS_REPORT_URL = '/api/tasks?lane=done&assignee=all&limit=200';

/**
 * Which tabs ANSWER the find text at the server (`?q=`), and therefore ride it
 * on their fetch instead of filtering the page in hand.
 *
 * Both entries are here because their page is a WINDOW the operator can fall
 * off: Bin utilization returns 500 of the warehouse's bins ORDERED BY FILL, and
 * Tasks returns the desk's most recent 200 finished follow-ups. A browser-side
 * filter over either can only ever find what already arrived — and it narrows
 * even that to the facts the MOUNTED columns paint, so a task found by its note
 * or a bin found by its barcode disappears when that column is off.
 *
 * Velocity (138 rows against a 200 cap), Dead stock (117 against 500) and
 * Packer day (one civil day against a 10,000 cap) are NOT here: their caps are
 * unreachable at this warehouse's volume, so the page in hand IS the whole
 * answer and their engine-side filter tells no lie. Staff day is a full report
 * for one date and has no cap at all.
 */
const FIND_ANSWERED_BY_SERVER: Readonly<Record<Tab, boolean>> = {
  staff: false,
  packer: false,
  utilization: true,
  velocity: false,
  dead: false,
  tasks: true,
};

/** `base` + the find text, for the tabs whose route answers it. */
function withFind(base: string, tab: Tab, find: string): string {
  const q = find.trim();
  return FIND_ANSWERED_BY_SERVER[tab] && q ? `${base}&q=${encodeURIComponent(q)}` : base;
}

/**
 * One fetched report page, TAGGED with the tab that asked for it.
 *
 * The tag is what keeps the three row shapes apart through one state slot: a
 * tab switch leaves the previous report in hand for a moment, and a page that
 * fed those rows to the new tab's family would hand a bin row to a SKU
 * resolver. Discriminating here is what `Record<string, unknown>` used to hide.
 */
type ReportFeed =
  | { tab: 'staff'; rows: readonly StaffDayReportRow[]; dateKey: string }
  | { tab: 'packer'; rows: readonly PackingReportRow[]; dateKey: string }
  | { tab: 'utilization'; rows: readonly BinUtilizationReportRow[] }
  | { tab: 'velocity'; rows: readonly VelocityReportRow[] }
  | { tab: 'dead'; rows: readonly DeadStockReportRow[] }
  | { tab: 'tasks'; rows: readonly TaskDeskRow[] };

/** Shared empty page — a fresh `[]` per render would rebuild every row memo. */
const NO_ROWS: readonly never[] = [];

async function fetchReportFeed(tab: Tab, dateKey: string, find: string): Promise<ReportFeed> {
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
  /*
   * Packer day reads the SAME endpoint as the phone's Packing tab
   * (`/m/reports`) and its CSV export — `format=json` on the export route —
   * so the desk table, the phone sheet and the downloaded file cannot disagree
   * about a shift. No new backend; the row shape is already the wire shape.
   */
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
  /*
   * Completed tasks read the task desk's OWN route, not a `/api/reports/*`
   * sibling: `work_assignments` already publishes the lane vocabulary the desk
   * and `/m` filter by, so a fourth report endpoint would be a second query
   * over the same rows that could disagree with them about what "done" is.
   * The envelope is the task list's, so it is narrowed by the task feed parser
   * rather than by `reportRouteFailure`.
   */
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

/**
 * What a SERVER-ANSWERED find hands its table: the text, its setter, and
 * whether a request for THAT text is still in flight. The last one is what
 * keeps the body in its loading face, so "no matches" is never painted over
 * the previous report's rows.
 */
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

/**
 * Completed tasks — one row per finished follow-up, EVERY staffer's.
 *
 * A plain mount like the three SKU families, with one footnote: the scope. No
 * day stepper — the window is the route's `limit`, not a calendar day.
 *
 * The footnote is load-bearing, not decoration. This page's other tabs are
 * obviously org-wide (a whole shift, the whole warehouse), but a task carries
 * an assignee, and the task DESK a staffer opens elsewhere is scoped to them.
 * A short list here would otherwise read as a filter they forgot they set, so
 * the line says whose record it is and what the pair of dates means.
 */
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

/**
 * The day walk, shared by every DAY-SCOPED tab.
 *
 * Desk vocabulary — quiet secondary chips over the table, the same walk-back
 * the phone surface ships. Forward stops at today: a report is a record, and
 * there is nothing to read in tomorrow. Extracted 2026-09-16 when Packer day
 * became the second day-scoped family; two copies of a stepper is how two tabs
 * come to disagree about which day "Today" is.
 */
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

/**
 * Packer day — one row per pack, for one PST day.
 *
 * The footnote is load-bearing, not decoration: `Time to pack` is the SKU's
 * STANDARD (count × standard), not observed handling time — no pack-start
 * event exists, so every pack carries exactly one timestamp. The `Basis`
 * column says per row whether a human set that standard. Stating it here is
 * the difference between this report and the KPI tile it replaced, which
 * showed one weighted total and explained nothing.
 */
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

/**
 * Which family MOUNTS — never which column set a shared host receives.
 *
 * Each branch renders a different component because each calls a different
 * family's feed hook, and hooks cannot be chosen conditionally. That
 * constraint is the same one the architecture wants: the mount is per entity.
 *
 * A feed tagged for another tab reads as EMPTY rather than being handed to the
 * wrong resolver — that window is one render wide (the tab flips, the fetch
 * starts) and `loading` is already true through it.
 */
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
  const searchParams = useSearchParams();

  /*
   * URL-ADDRESSABLE tabs and date (Track R1): `?tab=staff&date=` is a
   * link a lead can send, and the phone and the desk can point at the SAME
   * day. `replace`, not `push` — a tab flip is a view change, not a place the
   * Back button owes a stop. The tab is still local-state-fast; the URL rides
   * along. Default tab is Staff day now — the report the operator asked for by
   * name leads, and the SKU families are one underline tap away.
   */
  const tabParam = searchParams.get('tab');
  const tab: Tab = TABS.some((t) => t.id === tabParam) ? (tabParam as Tab) : 'staff';
  const dateParam = searchParams.get('date');
  const dateKey = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : getCurrentPSTDateKey();

  /*
   * The find text is SESSION-LOCAL and rides the FETCH KEY — it is deliberately
   * NOT a third URL param. `?tab=` and `?date=` are a place a lead can link to;
   * a half-typed filter is not, and re-rendering the desk through the router on
   * every settled keystroke would be a round trip for nothing.
   *
   * A tab flip CLEARS it. Each tab is a different report with a different
   * vocabulary, and carrying "C-03-18" from Bin utilization into Tasks would
   * open that tab on an empty table the operator never asked for.
   *
   * `SearchField` already debounces at 320ms, so this value is the key as-is.
   */
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

  /*
   * The desk frame, not a second one (2026-08-31).
   *
   * This drew a `PageHeader` plus its own segmented tab strip — a filled-face
   * selection (`bg-surface-inverse text-white`) beside the underline row every
   * other page uses. Two tab vocabularies on one product is the fork the chrome
   * moved into the design system to end.
   *
   * The tabs are passed EXPLICITLY because Reports' modes are local view state,
   * not nav children: `/reports` has no spine drill-down to withdraw, so there
   * is nothing for `deskChrome` to opt into. The frame takes them as data
   * either way — which is the point of it taking data.
   *
   * `title` is passed for the same reason: the spine does not name this page,
   * so the default (its nav label) would be empty.
   */
  return (
    <DeskPageLayout
      title="Reports"
      tabs={TABS}
      activeTab={tab}
      onTabChange={(id) => setParams({ tab: id as Tab })}
      className="h-full"
    >
      <DeskActionSlotRegistrar>
        <DeskHeaderAction variant="secondary" size="md" type="button" onClick={load}>
          Refresh
        </DeskHeaderAction>
      </DeskActionSlotRegistrar>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col px-3 py-3">
        {error && (
          <p className="px-3 py-6 text-center text-sm font-semibold text-rose-600">{error}</p>
        )}
        {!error && (
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
