'use client';

/** Mobile V2 reports: top-level analytical facets plus a separate activity feed. */

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  PackageCheck,
  RefreshCw,
  User,
} from '@/components/Icons';
import { MobileActionSlotRegistrar, MobileTopBarAction } from '@/components/mobile/v2/MobileV2ActionSlot';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import { DetailDock } from '@/design-system/components/DetailDock';
import { EvidenceDisclosure } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { Button } from '@/design-system/primitives';
import { ProgressBar } from '@/design-system/primitives/ProgressBar';
import { cornerClass, MOBILE_ROW_CORNER } from '@/design-system/tokens/radius';
import type {
  ActiveOperation,
  MeasuredOperation,
  OperationsReportPayload,
  StaffOperationsReport,
} from '@/lib/reports/operations-report-contract';
import {
  buildMobileReportsV2Model,
  type MobileReportAttention,
  type MobileReportStage,
} from '@/lib/reports/mobile-reports-v2-model';
import {
  MOBILE_REPORTS_V2_FACETS,
  type MobileReportsV2Facet,
} from '@/lib/reports/mobile-reports-v2-contract';
import { formatDuration } from '@/lib/studio/flow-metrics';
import {
  addDaysToDateKey,
  dateKeyToLocalDate,
  formatDateKeyMedium,
  getCurrentPSTDateKey,
  isDateKey,
  localDateToDateKey,
} from '@/utils/date';

const POLL_MS = 15_000;
const EARLIEST_REPORT_DATE = new Date(2020, 0, 1);
function isReportFacet(value: string | null): value is MobileReportsV2Facet {
  return MOBILE_REPORTS_V2_FACETS.some((facet) => facet.id === value);
}

function operationLabel(kind: 'pick' | 'pack'): string {
  return kind === 'pick' ? 'Picking' : 'Packing';
}

function elapsedSeconds(startedAt: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1_000));
}

function duration(seconds: number | null): string {
  return seconds == null ? '—' : formatDuration(seconds);
}

export function MobilePackerReport({ surface = 'reports' }: { surface?: 'reports' | 'activity' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = getCurrentPSTDateKey();
  const rawDate = searchParams.get('date');
  const date = isDateKey(rawDate) ? rawDate as string : today;
  const rawView = searchParams.get('view');
  const view: MobileReportsV2Facet = isReportFacet(rawView) ? rawView : 'pulse';
  const live = date === today;
  const [payload, setPayload] = useState<OperationsReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const requestIdRef = useRef(0);

  const load = useCallback(async (quiet = false) => {
    const requestId = ++requestIdRef.current;
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const next = await fetchReport(date);
      if (requestId === requestIdRef.current) {
        setPayload(next);
        setNow(Date.now());
      }
    } catch (failure) {
      if (requestId === requestIdRef.current) {
        setError(failure instanceof Error ? failure.message : 'Could not load the operations report.');
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [date]);

  useEffect(() => {
    setPayload(null);
    void load();
  }, [load]);

  useEffect(() => {
    if (!live) return;
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') void load(true);
    };
    const interval = window.setInterval(refreshVisible, POLL_MS);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [live, load]);

  useEffect(() => {
    if (!payload?.activeOperations.length) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [payload?.activeOperations.length]);

  const goToDate = (nextDate: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextDate === today) params.delete('date');
    else params.set('date', nextDate);
    const query = params.toString();
    const pathname = surface === 'activity' ? '/m/activity' : '/m/reports';
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const goToView = (nextView: string) => {
    if (!isReportFacet(nextView)) return;
    const params = new URLSearchParams(searchParams.toString());
    if (nextView === 'pulse') params.delete('view');
    else params.set('view', nextView);
    const query = params.toString();
    router.replace(query ? `/m/reports?${query}` : '/m/reports', { scroll: false });
  };

  return (
    <div className="flex min-h-full flex-col bg-surface-canvas" data-testid="mobile-operations-report">
      <MobileActionSlotRegistrar>
        <MobileTopBarAction
          icon={<RefreshCw className={refreshing ? 'size-4 animate-spin' : 'size-4'} />}
          onClick={() => void load(true)}
          disabled={loading || refreshing}
          ariaLabel="Refresh operations report"
          className="w-11 px-0"
          data-testid="reports-refresh"
        />
      </MobileActionSlotRegistrar>

      {surface === 'reports' ? (
        <div className="px-3 pt-3">
          <TabSwitch
            tabs={[...MOBILE_REPORTS_V2_FACETS]}
            activeTab={view}
            onTabChange={goToView}
            solidTone="accent"
          />
        </div>
      ) : null}

      <main className="flex w-full max-w-5xl flex-1 flex-col gap-3 self-center px-3 py-3 font-sans">
        {loading && !payload ? (
          <p className="py-16 text-center text-role-data font-semibold text-text-muted">Loading operations…</p>
        ) : error && !payload ? (
          <section className={`${cornerClass('card')} border border-red-200 bg-red-50 p-4`}>
            <p className="text-role-caption font-semibold text-text-danger">{error}</p>
            <Button variant="secondary" radius="pill" size="lg" className="mt-3 w-full" onClick={() => void load()}>
              Retry
            </Button>
          </section>
        ) : payload ? (
          <OperationsReportBody
            payload={payload}
            now={now}
            live={live}
            refreshing={refreshing}
            error={error}
            view={surface === 'activity' ? 'activity' : view}
          />
        ) : null}
      </main>

      <ReportDateDock date={date} today={today} onDateChange={goToDate} />
    </div>
  );
}

async function fetchReport(date: string): Promise<OperationsReportPayload> {
  const response = await fetch(`/api/reports/operations-live?day=${encodeURIComponent(date)}`, { cache: 'no-store' });
  const body: unknown = await response.json();
  if (!response.ok || !body || typeof body !== 'object' || !('ok' in body) || body.ok !== true) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error
      : 'Could not load the operations report.';
    throw new Error(message);
  }
  return body as OperationsReportPayload;
}

function OperationsReportBody({
  payload,
  now,
  live,
  refreshing,
  error,
  view,
}: {
  payload: OperationsReportPayload;
  now: number;
  live: boolean;
  refreshing: boolean;
  error: string | null;
  view: MobileReportsV2Facet | 'activity';
}) {
  const model = buildMobileReportsV2Model(payload, { live, now });
  return (
    <>
      {error ? (
        <p className={`${cornerClass('field')} border border-red-200 bg-red-50 px-3 py-2 text-role-micro text-text-danger`}>
          Live refresh failed. Showing the last successful report.
        </p>
      ) : null}
      {view === 'pulse' ? (
        <>
          <ShiftPulse
            status={model.status}
            completed={model.completedOperations}
            active={payload.activeOperations.length}
            standardMinutes={model.standardMinutes}
            capacityMinutes={model.capacityMinutes}
            live={live}
          />
          <AttentionQueue items={model.attention} live={live} />
          <Link
            href={live ? '/m/activity' : `/m/activity?date=${encodeURIComponent(payload.day)}`}
            className={`${cornerClass('card')} flex min-h-14 items-center gap-3 border border-border-soft bg-surface-card px-4 py-3 text-sm font-semibold text-text-default shadow-elev-soft`}
          >
            <Activity className="size-5 text-text-accent" />
            <span className="min-w-0 flex-1">Open operation activity</span>
            <span className="tabular-nums text-text-muted">{payload.activity.length}</span>
            <ChevronRight className="size-4 text-text-faint" />
          </Link>
        </>
      ) : null}
      {view === 'stages' ? <StageThroughput stages={model.stages} /> : null}
      {view === 'staff' ? (
        <StaffPulse
          working={model.staff.working}
          completed={model.staff.completed}
          idle={model.staff.idle}
          now={now}
        />
      ) : null}
      {view === 'activity' ? (
        <ActivityFeed rows={payload.activity} active={payload.activeOperations} now={now} live={live} />
      ) : null}
      <p className="px-1 pb-1 text-center text-role-micro text-text-faint" aria-live="polite">
        Updated {new Date(payload.generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
        {live ? ' · live every 15s' : ''}{refreshing ? ' · refreshing' : ''}
      </p>
    </>
  );
}

function ShiftPulse({
  status,
  completed,
  active,
  standardMinutes,
  capacityMinutes,
  live,
}: {
  status: ReturnType<typeof buildMobileReportsV2Model>['status'];
  completed: number;
  active: number;
  standardMinutes: number;
  capacityMinutes: number;
  live: boolean;
}) {
  const tone = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-red-200 bg-red-50 text-red-800',
    neutral: 'border-border-soft bg-surface-card text-text-default',
  }[status.tone];
  return (
    <section
      data-testid="reports-shift-pulse"
      aria-labelledby="reports-shift-pulse-title"
      className={`${cornerClass('canvas')} overflow-hidden border p-4 shadow-elev-soft ${tone}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-role-eyebrow font-semibold uppercase tracking-wide opacity-70">Shift pulse</p>
          <h1 id="reports-shift-pulse-title" className="mt-1 text-2xl font-semibold tracking-tight">{status.label}</h1>
        </div>
        <span className="rounded-full border border-current/20 bg-white/60 px-2.5 py-1 text-role-micro font-semibold">
          {live ? 'Live' : 'History'}
        </span>
      </div>
      <p className="mt-2 text-base leading-6 opacity-80">{status.summary}</p>
      <div className="mt-4 flex items-end gap-5">
        <InlineMetric label="Completed" value={completed.toLocaleString()} />
        <InlineMetric label="Working now" value={live ? active.toLocaleString() : '—'} />
        <InlineMetric label="Standard min" value={standardMinutes.toLocaleString()} />
      </div>
      <ProgressBar
        current={standardMinutes}
        goal={capacityMinutes}
        ariaLabel="Standard pack workload against configured daily capacity"
        showPercentage={false}
        showRemaining={false}
        variant={status.tone === 'success' ? 'success' : 'default'}
        className="mt-4"
      />
      <p className="mt-2 text-sm leading-5 opacity-75">
        Standard pack effort: {standardMinutes.toLocaleString()} of {capacityMinutes.toLocaleString()} configured minutes. This is planned effort, not observed elapsed time.
      </p>
    </section>
  );
}

function InlineMetric({ label, value }: { label: string; value: string }) {
  return (
    <span className="min-w-0">
      <span className="block text-xs font-medium opacity-70">{label}</span>
      <span className="block text-xl font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function AttentionQueue({ items, live }: { items: readonly MobileReportAttention[]; live: boolean }) {
  return (
    <section data-testid="reports-attention" aria-labelledby="reports-attention-title" className={`${cornerClass('card')} border border-border-soft bg-surface-card p-3 shadow-elev-soft`}>
      <div className="flex items-center gap-2 px-1 pb-2">
        {items.length > 0
          ? <AlertTriangle className="size-4 text-amber-600" />
          : <CheckCircle className="size-4 text-emerald-600" />}
        <h2 id="reports-attention-title" className="text-role-data font-semibold text-text-default">Needs attention</h2>
        <span className="ml-auto text-role-micro font-semibold tabular-nums text-text-muted">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className={`${MOBILE_ROW_CORNER} flex min-h-14 items-center gap-3 bg-emerald-50 px-3 py-2`}>
          <CheckCircle className="size-5 shrink-0 text-emerald-600" />
          <p className="text-sm leading-5 text-emerald-900">
            {live ? 'No current throughput exception needs intervention.' : 'No evidence-quality exception was found for this recorded day.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className={`${MOBILE_ROW_CORNER} border px-3 py-2 ${item.tone === 'danger' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
              <p className={`text-sm font-semibold ${item.tone === 'danger' ? 'text-red-800' : 'text-amber-900'}`}>{item.title}</p>
              <p className="mt-1 text-sm leading-5 text-text-muted">{item.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StageThroughput({ stages }: { stages: readonly MobileReportStage[] }) {
  return (
    <section data-testid="reports-stage-throughput" aria-labelledby="reports-stage-throughput-title">
      <div className="mb-2 px-1">
        <h2 id="reports-stage-throughput-title" className="text-lg font-semibold text-text-default">Stage throughput</h2>
        <p className="mt-1 text-sm leading-5 text-text-muted">Observed elapsed time with the measured sample shown</p>
      </div>
      <div className="space-y-2">
        {stages.map((item) => (
          <EvidenceDisclosure
            key={item.id}
            variant="card"
            label={item.label}
            summary={`${item.completed} done · median ${duration(item.medianSeconds)}`}
            icon={item.id === 'pick' ? <Activity /> : <PackageCheck />}
            testId={`reports-stage-${item.id}`}
          >
            <dl className="divide-y divide-border-soft px-3">
              <FactRow label="Completed" value={item.completed.toLocaleString()} />
              <FactRow label="Working now" value={item.active.toLocaleString()} />
              <FactRow label="Median elapsed" value={duration(item.medianSeconds)} />
              <FactRow label="90th percentile" value={duration(item.p90Seconds)} />
              <FactRow label="Measured sample" value={`${item.measured} of ${item.completed} · ${item.coveragePercent}%`} />
            </dl>
            <p className="px-3 py-3 text-sm leading-5 text-text-muted">
              {item.id === 'pick'
                ? 'Pick time runs from the recorded picking-session start to completion.'
                : 'Pack time uses an observed capture session or completion cycle when available; standard minutes are kept separate.'}
            </p>
          </EvidenceDisclosure>
        ))}
      </div>
    </section>
  );
}

function StaffPulse({
  working,
  completed,
  idle,
  now,
}: {
  working: readonly StaffOperationsReport[];
  completed: readonly StaffOperationsReport[];
  idle: readonly StaffOperationsReport[];
  now: number;
}) {
  const all = [...working, ...completed, ...idle];
  return (
    <section data-testid="reports-staff-pulse" aria-labelledby="reports-staff-title" className={`${cornerClass('card')} overflow-hidden border border-border-soft bg-surface-card shadow-elev-soft`}>
      <header className="flex min-h-14 items-center gap-3 border-b border-border-soft px-4 py-3">
        <User className="size-5 text-text-accent" />
        <div className="min-w-0 flex-1">
          <h2 id="reports-staff-title" className="text-base font-semibold text-text-default">Staff throughput</h2>
          <p className="text-sm text-text-muted">{working.length} working · {all.length} rostered</p>
        </div>
      </header>
        {all.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-text-muted">No rostered packers or measured operators found.</p>
        ) : (
          <div className="divide-y divide-border-soft">
            <StaffGroup label="Working now" rows={working} now={now} />
            <StaffGroup label="Completed work" rows={completed} now={now} />
            <StaffGroup label="No measured work" rows={idle} now={now} />
          </div>
        )}
    </section>
  );
}

function StaffGroup({ label, rows, now }: { label: string; rows: readonly StaffOperationsReport[]; now: number }) {
  if (rows.length === 0) return null;
  return (
    <section aria-label={label}>
      <h3 className="bg-surface-sunken/60 px-3 py-1.5 text-role-eyebrow font-semibold uppercase tracking-wide text-text-faint">{label}</h3>
      <ul className="divide-y divide-border-soft">
        {rows.map((row) => <StaffRow key={row.staffId ?? 'unknown'} row={row} now={now} />)}
      </ul>
    </section>
  );
}

function StaffRow({ row, now }: { row: StaffOperationsReport; now: number }) {
  return (
    <li className="px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 flex-1">
          <span className="block break-words text-base font-semibold text-text-default">{row.staffName}</span>
          <span className="block text-sm text-text-muted">{row.pickCount} picks · {row.packCount} packs</span>
        </span>
        <span className="shrink-0 text-right text-sm text-text-muted">
          <span className="block font-semibold tabular-nums text-text-default">Pick {duration(row.medianPickSeconds)}</span>
          <span className="block font-semibold tabular-nums text-text-default">Pack {duration(row.medianPackSeconds)}</span>
        </span>
      </div>
      {row.activeOperations.map((operation) => (
        <ActiveOperationRow key={operation.key} operation={operation} now={now} />
      ))}
    </li>
  );
}

function ActiveOperationRow({ operation, now }: { operation: ActiveOperation; now: number }) {
  const content = (
    <>
      <span className="min-w-0 flex-1 break-words">{operationLabel(operation.kind)} · {operation.title}</span>
      <span className="font-semibold tabular-nums text-emerald-700">{formatDuration(elapsedSeconds(operation.startedAt, now))}</span>
      {operation.href ? <ChevronRight className="size-4 shrink-0" /> : null}
    </>
  );
  const classes = `${MOBILE_ROW_CORNER} mt-2 flex min-h-11 items-center gap-2 bg-emerald-50 px-2.5 py-2 text-sm text-emerald-900`;
  return operation.href
    ? <Link href={operation.href} className={classes}>{content}</Link>
    : <div className={classes}>{content}</div>;
}

function ActivityFeed({
  rows,
  active,
  now,
  live,
}: {
  rows: readonly MeasuredOperation[];
  active: readonly ActiveOperation[];
  now: number;
  live: boolean;
}) {
  return (
    <section data-testid="reports-activity" aria-labelledby="reports-activity-title" className={`${cornerClass('card')} overflow-hidden border border-border-soft bg-surface-card shadow-elev-soft`}>
      <header className="flex min-h-14 items-center gap-3 border-b border-border-soft px-4 py-3">
        <Clock className="size-5 text-text-accent" />
        <div className="min-w-0 flex-1">
          <h1 id="reports-activity-title" className="text-base font-semibold text-text-default">Operation activity</h1>
          <p className="text-sm text-text-muted">
            {live ? `${active.length} working now · ` : ''}{rows.length} completed
          </p>
        </div>
      </header>
      {live && active.length > 0 ? (
        <section className="border-b border-border-soft px-3 pb-3" aria-label="Working now">
          <h2 className="pt-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Working now</h2>
          {active.map((operation) => (
            <ActiveOperationRow key={operation.key} operation={operation} now={now} />
          ))}
        </section>
      ) : null}
      <OperationList rows={rows} />
    </section>
  );
}

function OperationList({ rows }: { rows: readonly MeasuredOperation[] }) {
  if (rows.length === 0) {
    return <p className="px-3 py-6 text-center text-role-caption text-text-muted">No completed pick or pack work this day.</p>;
  }
  return (
    <ul className="divide-y divide-border-soft">
      {rows.map((row) => {
        const content = (
          <>
            <span className="min-w-0 flex-1">
              <span className="block break-words text-sm font-semibold text-text-default">{row.title}</span>
              <span className="mt-1 block break-words text-sm text-text-muted">
                {row.staffName?.trim() || (row.staffId == null ? 'Unknown staff' : `Staff #${row.staffId}`)} · {operationLabel(row.kind)}
              </span>
              {row.subtitle ? <span className="mt-1 block break-all font-mono text-xs text-text-muted">{row.subtitle}</span> : null}
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-sm font-semibold tabular-nums text-text-default">{duration(row.durationSeconds)}</span>
              <span className="block text-xs text-text-muted">{new Date(row.completedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
            </span>
            {row.href ? <ChevronRight className="size-4 shrink-0 text-text-faint" /> : null}
          </>
        );
        return (
          <li key={row.key}>
            {row.href
              ? <Link href={row.href} className="flex min-h-16 items-center gap-3 px-3 py-2 active:bg-surface-sunken">{content}</Link>
              : <div className="flex min-h-16 items-center gap-3 px-3 py-2">{content}</div>}
          </li>
        );
      })}
    </ul>
  );
}

function FactRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center gap-3 py-2">
      <dt className="min-w-0 flex-1 text-role-caption text-text-muted">{label}</dt>
      <dd className="shrink-0 text-right text-sm font-semibold tabular-nums text-text-default">{value}</dd>
    </div>
  );
}

function ReportDateDock({
  date,
  today,
  onDateChange,
}: {
  date: string;
  today: string;
  onDateChange: (date: string) => void;
}) {
  const selected = dateKeyToLocalDate(date);
  return (
    <DetailDock
      label="Report date"
      verbs={[
        { id: 'earlier', label: 'Earlier', icon: <ChevronLeft />, testId: 'reports-earlier' },
        { id: 'later', label: 'Later', icon: <ChevronRight />, disabled: date >= today, testId: 'reports-later' },
      ] as const}
      onVerb={(id) => onDateChange(addDaysToDateKey(date, id === 'earlier' ? -1 : 1))}
      center={(
        <DateRangePickerField
          variant="compact"
          value={selected}
          onChange={(next) => {
            const key = localDateToDateKey(next);
            if (key) onDateChange(key);
          }}
          fromDate={EARLIEST_REPORT_DATE}
          toDate={dateKeyToLocalDate(today)}
          faceLabel={date === today ? 'Today' : formatDateKeyMedium(date, { weekday: 'short' })}
          ariaLabel="Choose report date"
          className="min-h-mode-hit-cta justify-center rounded-xl px-2 text-center"
        />
      )}
    />
  );
}
