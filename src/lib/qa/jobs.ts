/**
 * QA Console job controls — trigger the SAME cron routes production uses.
 * There is no separate fake runner and no arbitrary DB edit.
 */

import pool from '@/lib/db';
import {
  CRON_JOBS,
  CRON_JOBS_BY_KEY,
  CRON_JOB_TRIGGER_PATH,
  computeHealth,
  type JobHealth,
} from '@/lib/cron/registry';

export interface QaJobSummary {
  job: string;
  label: string;
  category: string;
  schedule: string | null;
  health: JobHealth;
  triggerable: boolean;
  lastRun: {
    id: number | null;
    status: 'running' | 'success' | 'failed';
    trigger: string | null;
    startedAt: string;
    finishedAt: string | null;
    durationMs: number | null;
    error: string | null;
    summary: unknown;
  } | null;
}

export interface QaJobAttempt {
  id: number;
  job: string;
  status: string;
  trigger: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  error: string | null;
  summary: unknown;
}

interface LatestRow {
  id: number;
  job: string;
  status: 'running' | 'success' | 'failed';
  trigger: string | null;
  started_at: Date;
  finished_at: Date | null;
  duration_ms: number | null;
  summary: unknown;
  error: string | null;
}

export async function listQaJobs(): Promise<QaJobSummary[]> {
  const { rows } = await pool.query<LatestRow>(
    `SELECT DISTINCT ON (job)
            id, job, status, trigger, started_at, finished_at, duration_ms, summary, error
       FROM cron_runs
      ORDER BY job, started_at DESC`,
  );
  const latestByJob = new Map(rows.map((r) => [r.job, r]));
  const keys = new Set<string>([...CRON_JOBS.map((j) => j.job), ...latestByJob.keys()]);

  const jobs: QaJobSummary[] = [...keys].map((job) => {
    const def = CRON_JOBS_BY_KEY[job];
    const latest = latestByJob.get(job) ?? null;
    return {
      job,
      label: def?.label ?? job,
      category: def?.category ?? 'System',
      schedule: def?.schedule ?? null,
      health: computeHealth(
        def,
        latest ? { status: latest.status, finishedAt: latest.finished_at?.toISOString() ?? null } : null,
      ),
      triggerable: Boolean(CRON_JOB_TRIGGER_PATH[job]),
      lastRun: latest
        ? {
            id: latest.id,
            status: latest.status,
            trigger: latest.trigger,
            startedAt: new Date(latest.started_at).toISOString(),
            finishedAt: latest.finished_at ? new Date(latest.finished_at).toISOString() : null,
            durationMs: latest.duration_ms,
            error: latest.error,
            summary: latest.summary,
          }
        : null,
    };
  });

  const sev: Record<JobHealth, number> = { failed: 0, stale: 1, never: 2, running: 3, ok: 4 };
  jobs.sort((a, b) => sev[a.health] - sev[b.health] || a.label.localeCompare(b.label));
  return jobs;
}

export async function listQaJobAttempts(job: string, limit = 20): Promise<QaJobAttempt[]> {
  const { rows } = await pool.query<LatestRow>(
    `SELECT id, job, status, trigger, started_at, finished_at, duration_ms, summary, error
       FROM cron_runs
      WHERE job = $1
      ORDER BY started_at DESC
      LIMIT $2`,
    [job, Math.max(1, Math.min(50, limit))],
  );
  return rows.map((r) => ({
    id: r.id,
    job: r.job,
    status: r.status,
    trigger: r.trigger,
    startedAt: new Date(r.started_at).toISOString(),
    finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
    durationMs: r.duration_ms,
    error: r.error,
    summary: r.summary,
  }));
}

export async function triggerQaJob(
  origin: string,
  job: string,
): Promise<{ ok: boolean; status: number; result: unknown }> {
  const path = CRON_JOB_TRIGGER_PATH[job];
  if (!path) {
    throw Object.assign(new Error(`No production trigger path for job ${job}`), { status: 400 });
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw Object.assign(new Error('CRON_SECRET is not configured'), { status: 503 });
  }
  const res = await fetch(`${origin}${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${secret}` },
    cache: 'no-store',
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, result: body };
}
