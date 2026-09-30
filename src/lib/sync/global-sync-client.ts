'use client';

/**
 * The browser side of Global Sync (`GET/POST /api/sync/global`): the job list
 * and the run pool. Every run — pressed here or scheduled (a cron the ledger
 * says is running) — is a `sync` item in the background-work record, so the
 * header's Sync spin, its panel rows and the top-left sentence all read one
 * source. One work id per job (`sync:<job id>`): a pressed run and the
 * ledger's "running" for the same job are one row, never two.
 */

import { useEffect, useMemo } from 'react';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { beginWork, readWork, type WorkHandle } from '@/lib/background-work/store';
import { invalidateDashboardOrderQueries } from '@/lib/dashboard-query-invalidation';
import type { GlobalSyncJob } from '@/lib/sync/global-sync';
import { toast } from '@/lib/toast';

export const GLOBAL_SYNC_JOBS_KEY = ['global-sync-jobs'] as const;
/** Jobs are independent round trips; a few at a time keeps the lane responsive. */
const CONCURRENCY = 4;
const TOAST_ID = 'global-sync';
const TOAST_MS = 12_000;
/** The crons keep syncing while the page sits: re-read the ledger every minute, faster while one runs. */
const POLL_MS = 60_000;
const POLL_RUNNING_MS = 10_000;
/** A ledger row still "running" after this long is a crashed run, not work in flight. */
const STALE_RUNNING_MS = 30 * 60_000;

/** The work-record id of one Global Sync job. */
export const syncWorkId = (jobId: string) => `sync:${jobId}`;

async function fetchJobs(): Promise<GlobalSyncJob[]> {
  const res = await fetch('/api/sync/global');
  if (!res.ok) throw new Error('Could not load sync jobs');
  const data = (await res.json().catch(() => ({}))) as { jobs?: GlobalSyncJob[] };
  return data.jobs ?? [];
}

export function fetchGlobalSyncJobs(queryClient: QueryClient): Promise<GlobalSyncJob[]> {
  return queryClient.fetchQuery<GlobalSyncJob[]>({ queryKey: GLOBAL_SYNC_JOBS_KEY, queryFn: fetchJobs });
}

const isRunningOnServer = (job: GlobalSyncJob, now: number) =>
  job.lastRun?.status === 'running' && now - Date.parse(job.lastRun.at) < STALE_RUNNING_MS;

/** Items this tab began from the ledger (a cron run), keyed by work id — finished when the ledger says so. */
const ledgerRuns = new Map<string, WorkHandle>();

function feedLedgerRuns(jobs: readonly GlobalSyncJob[]): void {
  const now = Date.now();
  for (const job of jobs) {
    const id = syncWorkId(job.id);
    if (isRunningOnServer(job, now)) {
      // A run pressed in this tab already owns the row; the ledger only adds runs it cannot see.
      if (!ledgerRuns.has(id) && readWork(id)?.status !== 'running') {
        ledgerRuns.set(id, beginWork({ kind: 'sync', label: job.label, id }));
      }
      continue;
    }
    const handle = ledgerRuns.get(id);
    if (!handle) continue;
    ledgerRuns.delete(id);
    if (job.lastRun?.status === 'failed') handle.fail('Scheduled run failed');
    else handle.finish('Scheduled run finished');
  }
}

/** The job list, polled; ledger-running jobs feed the background-work record. Mount once (the header). */
export function useGlobalSyncJobs() {
  const query = useQuery({
    queryKey: GLOBAL_SYNC_JOBS_KEY,
    queryFn: fetchJobs,
    staleTime: 30_000,
    refetchInterval: (q) => (q.state.data?.some((job) => isRunningOnServer(job, Date.now())) ? POLL_RUNNING_MS : POLL_MS),
    retry: false,
  });
  const jobs = useMemo(() => query.data ?? [], [query.data]);
  useEffect(() => feedLedgerRuns(jobs), [jobs]);
  return { query, jobs };
}

interface JobOutcome {
  ok: boolean;
  message: string;
}

async function runJob(id: string): Promise<JobOutcome> {
  try {
    const res = await fetch(`/api/sync/global?job=${encodeURIComponent(id)}`, { method: 'POST' });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; summary?: string; error?: string };
    return res.ok && data.ok
      ? { ok: true, message: data.summary || 'Done' }
      : { ok: false, message: data.error || `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Network error' };
  }
}

/** Run jobs a few at a time; each job's work item reports its own outcome as it lands. A job already running is skipped. */
export async function runGlobalSync(queryClient: QueryClient, targets: readonly GlobalSyncJob[], label: string): Promise<void> {
  const runnable = targets.filter((job) => job.canRun && readWork(syncWorkId(job.id))?.status !== 'running');
  if (runnable.length === 0) return;
  const work = new Map(runnable.map((job) => [job.id, beginWork({ kind: 'sync', label: job.label, id: syncWorkId(job.id) })]));
  let failed = 0;
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, runnable.length) }, async () => {
      while (next < runnable.length) {
        const job = runnable[next++];
        const outcome = await runJob(job.id);
        if (outcome.ok) work.get(job.id)?.finish(outcome.message);
        else {
          failed += 1;
          work.get(job.id)?.fail(outcome.message);
        }
      }
    }),
  );
  if (runnable.some((job) => job.direction === 'outbound')) await invalidateDashboardOrderQueries(queryClient);
  // The record the pill reads just changed.
  void queryClient.invalidateQueries({ queryKey: GLOBAL_SYNC_JOBS_KEY });
  const ok = runnable.length - failed;
  const message = failed === 0 ? `${label}: ${ok} synced` : `${label}: ${ok} synced, ${failed} failed`;
  if (failed === 0) toast.success(message, { id: TOAST_ID, duration: TOAST_MS, closeButton: true });
  else toast.error(message, { id: TOAST_ID, duration: TOAST_MS });
}
