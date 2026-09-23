'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import { Loader2, Play, ExternalLink, Workflow } from '@/components/Icons';
import { Button, EmptyState } from '@/design-system/primitives';
import { useCronRunsSummary } from '@/hooks/useCronRuns';
import {
  cronRunsKeys,
  type CronJobStatus,
  type JobHealth,
} from '@/lib/queries/cron-runs-queries';
import {
  AUTOMATION_CATALOG,
  type AutomationDef,
} from '@/lib/automations/automation-catalog';

/**
 * /studio/automations — the first-principles answer to *"what runs by itself
 * in this warehouse, when, and did it work?"*
 *
 * The static half is {@link AUTOMATION_CATALOG} (what each automation IS); the
 * live half is `/api/cron-runs?view=summary`, read through the SAME
 * {@link useCronRunsSummary} hook the admin System-sync tab uses — one fetcher,
 * one cache, one poll. Cron rows join on `trigger.jobKey`.
 *
 * Run counters are read GENERICALLY off `lastRun.summary`: any numeric field a
 * job persists is painted, so a job that never wrote `assigned` simply shows
 * fewer chips instead of crashing on an absent key.
 */

const HEALTH_CHIP: Record<JobHealth, string> = {
  ok: 'bg-emerald-50 text-emerald-700',
  stale: 'bg-amber-50 text-amber-700',
  failed: 'bg-rose-50 text-rose-700',
  running: 'bg-blue-50 text-blue-700',
  never: 'bg-surface-sunken text-text-muted',
};

const HEALTH_LABEL: Record<JobHealth, string> = {
  ok: 'Healthy',
  stale: 'Overdue',
  failed: 'Failed',
  running: 'Running now',
  never: 'Never run',
};

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  return formatDistanceToNowStrict(at, { addSuffix: true });
}

/** Every numeric field a run persisted, in the order the job wrote them. */
function runCounters(summary: unknown): Array<{ key: string; value: number }> {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return [];
  return Object.entries(summary as Record<string, unknown>)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    .map(([key, value]) => ({ key: key.replace(/[_.]/g, ' '), value }));
}

export interface AutomationRowProps {
  automation: AutomationDef;
  /** Live cron status for this row's job. Undefined for event automations. */
  status?: CronJobStatus;
  /** The live join is still loading — say so instead of painting "never". */
  statusPending?: boolean;
  /** The live join failed — say so instead of painting "never". */
  statusError?: boolean;
  canRunNow?: boolean;
  running?: boolean;
  onRunNow?: () => void;
}

export function AutomationRow({
  automation,
  status,
  statusPending = false,
  statusError = false,
  canRunNow = false,
  running = false,
  onRunNow,
}: AutomationRowProps) {
  const isCron = automation.trigger.kind === 'cron';
  const health = status?.health;
  const lastRun = status?.lastRun ?? null;
  const counters = runCounters(lastRun?.summary);

  return (
    <li className="bg-surface-card p-4 shadow-sm ring-1 ring-border-soft/60">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-role-body font-semibold text-text-default">{automation.name}</h3>
          <p className="mt-0.5 text-role-caption text-text-soft">{automation.summary}</p>
        </div>
        {isCron ? (
          statusPending ? (
            <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-surface-sunken inset-chip text-role-micro text-text-soft">
              <Loader2 className="h-3 w-3 animate-spin" /> Checking…
            </span>
          ) : statusError ? (
            <span className="shrink-0 rounded-full bg-rose-50 inset-chip text-role-micro text-rose-700">
              Health unavailable
            </span>
          ) : health ? (
            <span
              className={`shrink-0 rounded-full inset-chip text-role-micro font-semibold ${HEALTH_CHIP[health]}`}
            >
              {HEALTH_LABEL[health]}
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-surface-sunken inset-chip text-role-micro text-text-muted">
              Not reporting
            </span>
          )
        ) : (
          <span className="shrink-0 rounded-full bg-surface-sunken inset-chip text-role-micro text-text-muted">
            Event-fired
          </span>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-role-eyebrow uppercase tracking-[0.14em] text-text-faint">Runs</dt>
          <dd className="mt-0.5 text-role-caption text-text-muted">
            {automation.trigger.kind === 'cron'
              ? `${automation.trigger.cadence} · ${automation.trigger.jobKey}`
              : `On ${automation.trigger.on}`}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-role-eyebrow uppercase tracking-[0.14em] text-text-faint">Acts on</dt>
          <dd className="mt-0.5 text-role-caption text-text-muted">{automation.scope}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-role-eyebrow uppercase tracking-[0.14em] text-text-faint">
            Turned on by
          </dt>
          <dd className="mt-0.5 text-role-caption text-text-muted">{automation.gate}</dd>
        </div>
      </dl>

      {isCron && !statusPending && !statusError && status ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-role-micro text-text-soft">
            Last run {relativeTime(lastRun?.finishedAt ?? lastRun?.startedAt ?? null)}
          </span>
          {counters.map((counter) => (
            <span
              key={counter.key}
              className="rounded-full bg-surface-sunken inset-chip text-role-micro tabular-nums text-text-muted"
            >
              {counter.key} {counter.value}
            </span>
          ))}
          {lastRun?.error ? (
            <span className="text-role-micro text-rose-600">{lastRun.error}</span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        {isCron && canRunNow ? (
          <Button
            variant="secondary"
            size="sm"
            icon={<Play />}
            loading={running}
            onClick={onRunNow}
          >
            Run now
          </Button>
        ) : null}
        {automation.href ? (
          <a
            href={automation.href}
            className="inline-flex items-center gap-1.5 text-role-caption font-semibold text-blue-600 hover:underline"
          >
            Open its rules
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
        <span className="ml-auto text-role-micro text-text-faint">
          Visible to {automation.permission}
        </span>
      </div>
    </li>
  );
}

export interface AutomationsListProps {
  automations: readonly AutomationDef[];
  /** Live cron status keyed by job key. */
  statusByJob: Record<string, CronJobStatus>;
  statusPending?: boolean;
  statusError?: boolean;
  canRunNow?: boolean;
  runningJob?: string | null;
  onRunNow?: (jobKey: string) => void;
}

/** Pure list body — the catalog painted with whatever live status it was handed. */
export function AutomationsList({
  automations,
  statusByJob,
  statusPending = false,
  statusError = false,
  canRunNow = false,
  runningJob = null,
  onRunNow,
}: AutomationsListProps) {
  if (automations.length === 0) {
    return (
      <EmptyState
        icon={<Workflow className="h-6 w-6 text-text-faint" />}
        title="Nothing runs by itself yet"
        description="No automation is registered for this warehouse."
      />
    );
  }
  return (
    <ul className="space-y-3">
      {automations.map((automation) => {
        const jobKey = automation.trigger.kind === 'cron' ? automation.trigger.jobKey : null;
        return (
          <AutomationRow
            key={automation.id}
            automation={automation}
            status={jobKey ? statusByJob[jobKey] : undefined}
            statusPending={jobKey ? statusPending : false}
            statusError={jobKey ? statusError : false}
            canRunNow={canRunNow}
            running={!!jobKey && runningJob === jobKey}
            onRunNow={jobKey && onRunNow ? () => onRunNow(jobKey) : undefined}
          />
        );
      })}
    </ul>
  );
}

export interface AutomationsViewProps {
  /** Viewer holds `admin.view` — the permission that may trigger a cron job. */
  canRunNow: boolean;
}

export function AutomationsView({ canRunNow }: AutomationsViewProps) {
  const summary = useCronRunsSummary();
  const queryClient = useQueryClient();
  const [runningJob, setRunningJob] = useState<string | null>(null);

  const statusByJob: Record<string, CronJobStatus> = {};
  for (const job of summary.data?.jobs ?? []) statusByJob[job.job] = job;

  const runNow = async (jobKey: string) => {
    setRunningJob(jobKey);
    try {
      await fetch(`/api/cron-runs/run?job=${encodeURIComponent(jobKey)}`, { method: 'POST' });
      await queryClient.invalidateQueries({ queryKey: cronRunsKeys.all });
    } finally {
      setRunningJob(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 px-6 py-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-text-default">
          <Workflow className="h-5 w-5 text-text-faint" /> Automation rules
        </h1>
        <p className="mt-0.5 text-role-caption text-text-soft">
          Everything that runs without an operator — when it fires, what it acts on, what turns it
          on, and how it last went.
        </p>
      </header>

      <AutomationsList
        automations={AUTOMATION_CATALOG}
        statusByJob={statusByJob}
        statusPending={summary.isPending}
        statusError={summary.isError}
        canRunNow={canRunNow}
        runningJob={runningJob}
        onRunNow={runNow}
      />
    </div>
  );
}
