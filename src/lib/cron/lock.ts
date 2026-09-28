/** Distributed cron lock (Wave 4). */
import { lockPool } from '@/lib/db';

interface CronLockResult<T> {
  /** False when another invocation already held the lock (this run was skipped). */
  ran: boolean;
  result?: T;
}

/**
 * Run `fn` while holding the named advisory lock. If the lock is already held
 * by another invocation, skip (`ran: false`) instead of waiting — overlapping
 * cron work is wasteful, not something to queue behind.
 */
export async function withCronLock<T>(
  jobName: string,
  fn: () => Promise<T>,
): Promise<CronLockResult<T>> {
  // One dedicated client for the whole critical section: session-level advisory
  // locks are per-connection, so lock + work + unlock must share it — hence the
  // direct (non-pgbouncer) pool; see `lockPool`.
  const client = await lockPool.connect();
  try {
    const lockRes = await client.query<{ locked: boolean }>(
      `SELECT pg_try_advisory_lock(hashtext($1)) AS locked`,
      [jobName],
    );
    if (!lockRes.rows[0]?.locked) {
      console.warn(`[cron-lock] "${jobName}" is already running; skipping this invocation.`);
      return { ran: false };
    }
    try {
      const result = await fn();
      return { ran: true, result };
    } finally {
      // Best-effort explicit unlock; the lock also auto-releases on disconnect.
      await client
        .query(`SELECT pg_advisory_unlock(hashtext($1))`, [jobName])
        .catch(() => {});
    }
  } finally {
    client.release();
  }
}
