/**
 * Delete dead `staff_sessions` rows (revoked or expired) older than a grace
 * window. Nothing deleted them before, so dead rows outnumbered live ones and
 * every auth read shared a table that only grew.
 *
 * Batched (LIMIT per DELETE) so no single statement holds row locks or runs
 * into the role statement_timeout; stops at a time budget and reports whether
 * rows remain so the next run continues. `staff_stepups` rows cascade.
 */

import pool from '@/lib/db';

export interface SessionSweepOptions {
  /** Keep dead sessions this long (admin session history). */
  retentionDays: number;
  batchSize: number;
  timeBudgetMs: number;
}

export const DEFAULT_SESSION_SWEEP: SessionSweepOptions = {
  retentionDays: 30,
  batchSize: 5_000,
  timeBudgetMs: 40_000,
};

export interface SessionSweepResult {
  deleted: number;
  batches: number;
  /** True when the time budget ran out while full batches were still coming back. */
  more: boolean;
}

export async function sweepDeadSessions(
  opts: SessionSweepOptions = DEFAULT_SESSION_SWEEP,
): Promise<SessionSweepResult> {
  const deadline = Date.now() + opts.timeBudgetMs;
  let deleted = 0;
  let batches = 0;
  for (;;) {
    // Revoked: by revoked_at. Never revoked but expired: idx_staff_sessions_expiry_sweep.
    const r = await pool.query(
      `DELETE FROM staff_sessions
        WHERE sid IN (
          SELECT sid FROM staff_sessions
           WHERE (revoked_at IS NOT NULL AND revoked_at < NOW() - make_interval(days => $1))
              OR (revoked_at IS NULL AND expires_at < NOW() - make_interval(days => $1))
           LIMIT $2)`,
      [opts.retentionDays, opts.batchSize],
    );
    const n = r.rowCount ?? 0;
    deleted += n;
    batches += 1;
    if (n < opts.batchSize) return { deleted, batches, more: false };
    if (Date.now() >= deadline) return { deleted, batches, more: true };
  }
}
