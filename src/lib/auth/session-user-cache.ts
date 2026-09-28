/**
 * Brief in-process cache for the per-request auth row (session + staff envelope
 * + roles, `SESSION_USER_SQL` in current-user.ts).
 *
 * One page load fans out into the SSR layout plus N `withAuth` API calls, each
 * of which resolved the same sid with a multi-join. A short TTL collapses that
 * burst to one read, and concurrent misses for one key share one load.
 *
 * Staleness bound: writes on THIS instance invalidate immediately
 * (revokeSession / revokeAllSessionsForStaff / role + permission writers /
 * staff deactivation); another instance sees the change within the TTL
 * (AUTH_USER_CACHE_TTL_MS, default 10s; 0 disables the cache).
 *
 * An invalidation bumps a generation counter, so a load that was already in
 * flight when the write happened is returned to its caller but never stored.
 */

function readTtlMs(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

export interface SessionUserCacheOptions {
  ttlMs: number;
  maxEntries: number;
  now?: () => number;
}

interface Entry<T> {
  value: T;
  sid: string;
  staffId: number;
  expiresAt: number;
}

export interface SessionUserCache<T> {
  /** Cached value for (sid, credential), or `load()` — stored only when it returns a row. */
  get(sid: string, credential: string, load: () => Promise<T | undefined>): Promise<T | undefined>;
  invalidate(target?: { sid?: string; staffId?: number }): void;
  readonly size: number;
}

export function createSessionUserCache<T extends { staff_id: number }>(
  opts: SessionUserCacheOptions,
): SessionUserCache<T> {
  const now = opts.now ?? Date.now;
  const entries = new Map<string, Entry<T>>();
  const inflight = new Map<string, Promise<T | undefined>>();
  let generation = 0;

  return {
    get size() {
      return entries.size;
    },

    async get(sid, credential, load) {
      if (opts.ttlMs <= 0) return load();
      const key = `${credential}:${sid}`;
      const hit = entries.get(key);
      if (hit && hit.expiresAt > now()) return hit.value;
      if (hit) entries.delete(key);

      const pending = inflight.get(key);
      if (pending) return pending;

      const startedAt = generation;
      const p = load()
        .then((value) => {
          if (value && startedAt === generation) {
            if (entries.size >= opts.maxEntries) {
              // Map iteration is insertion order: drop the oldest entry.
              const oldest = entries.keys().next().value;
              if (oldest !== undefined) entries.delete(oldest);
            }
            entries.set(key, { value, sid, staffId: value.staff_id, expiresAt: now() + opts.ttlMs });
          }
          return value;
        })
        .finally(() => {
          inflight.delete(key);
        });
      inflight.set(key, p);
      return p;
    },

    invalidate(target) {
      generation += 1;
      if (!target || (target.sid === undefined && target.staffId === undefined)) {
        entries.clear();
        return;
      }
      for (const [key, entry] of entries) {
        if (entry.sid === target.sid || entry.staffId === target.staffId) entries.delete(key);
      }
    },
  };
}

/** The process-wide auth-row cache (row shape owned by current-user.ts). */
export const sessionUserCache = createSessionUserCache<{ staff_id: number }>({
  ttlMs: readTtlMs(process.env.AUTH_USER_CACHE_TTL_MS, 10_000),
  maxEntries: 10_000,
});

/** Drop cached auth rows: one sid, every session of one staff, or (no arg) everything. */
export function invalidateSessionUserCache(target?: { sid?: string; staffId?: number }): void {
  sessionUserCache.invalidate(target);
}
