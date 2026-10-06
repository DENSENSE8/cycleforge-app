import pool from '@/lib/db';

/**
 * Wraps a cron/job body so every invocation is persisted to `cron_runs`. The
 * body receives the ledger row id (null when the ledger insert failed) so it
 * can link its own records — e.g. `order_import_runs.cron_run_id`.
 * `failureOf` turns a RETURNED result into a failed run (its message on
 * `error`, the result still on `summary`) — for a job that finishes but could
 * not do its work, e.g. a carrier sweep with no carrier credentials.
 */
export async function withCronRun<T>(
  job: string,
  fn: (runId: number | null) => Promise<T>,
  opts?: { trigger?: 'cron' | 'manual'; failureOf?: (result: T) => string | null },
): Promise<T> {
  const trigger = opts?.trigger ?? 'cron';
  const startedAt = Date.now();

  let runId: number | null = null;
  try {
    const ins = await pool.query<{ id: string | number }>(
      `INSERT INTO cron_runs (job, status, trigger, started_at)
       VALUES ($1, 'running', $2, NOW())
       RETURNING id`,
      [job, trigger],
    );
    // BIGSERIAL arrives as a string (no int8 parser); ids stay < 2^53.
    const id = ins.rows[0]?.id;
    runId = id != null ? Number(id) : null;
  } catch {
    /* observability must never break the job */
  }

  try {
    const result = await fn(runId);
    const durationMs = Date.now() - startedAt;
    if (runId != null) {
      const summary =
        result && typeof result === 'object' ? JSON.stringify(result) : null;
      const failure = opts?.failureOf?.(result) ?? null;
      await pool
        .query(
          `UPDATE cron_runs
              SET status = $4, finished_at = NOW(), duration_ms = $2, summary = $3, error = $5
            WHERE id = $1`,
          [runId, durationMs, summary, failure ? 'failed' : 'success', failure?.slice(0, 2000) ?? null],
        )
        .catch(() => {});
    }
    return result;
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    if (runId != null) {
      await pool
        .query(
          `UPDATE cron_runs
              SET status = 'failed', finished_at = NOW(), duration_ms = $2, error = $3
            WHERE id = $1`,
          [runId, durationMs, message.slice(0, 2000)],
        )
        .catch(() => {});
    }
    throw err;
  }
}

/** Latest run per job key (finished, or started while still running). */
export async function latestCronRuns(
  jobKeys: readonly string[],
): Promise<Record<string, { status: 'running' | 'success' | 'failed'; at: string }>> {
  if (jobKeys.length === 0) return {};
  // One idx_cron_runs_job_started probe per key. DISTINCT ON over `job = ANY`
  // read and sorted every run of every key (37k for the ingest drain): ~210 ms
  // vs ~0.15 ms, on every desk page via GET /api/sync/global.
  const { rows } = await pool.query<{ job: string; status: 'running' | 'success' | 'failed'; at: string }>(
    `SELECT k.job, c.status, COALESCE(c.finished_at, c.started_at) AS at
       FROM unnest($1::text[]) AS k(job)
       CROSS JOIN LATERAL (
         SELECT cr.status, cr.finished_at, cr.started_at
           FROM cron_runs cr
          WHERE cr.job = k.job
          ORDER BY cr.started_at DESC
          LIMIT 1
       ) c`,
    [jobKeys],
  );
  return Object.fromEntries(rows.map((r) => [r.job, { status: r.status, at: new Date(r.at).toISOString() }]));
}
