/**
 * Per-org in-flight cap for assistant turns (SCALE-ROI row 4 / A4).
 *
 * `AI_ORG_MAX_INFLIGHT` (20) turns may run at once per org — one tenant cannot
 * occupy every model slot or assistant pool connection. Checked before the
 * turn's stream opens so a refusal is a real HTTP 429 with `Retry-After`. (The
 * per-staff rate is the route's `checkRateLimitForOrg({ staffId })` bucket.)
 *
 * A sorted set in Redis (member = turn id, score = ms) so every instance
 * shares it, and an entry left by a killed function ages out after
 * `INFLIGHT_STALE_MS` instead of leaking a slot forever. When Redis is
 * unconfigured (the dev lane) or errors, the same algorithm runs on an
 * in-process store: the cap degrades to per-instance, never to "off".
 */

import { isRedisConfigured, redisPipeline } from '@/lib/redis/client';

/** An in-flight entry older than this is a dead turn (maxDuration 300 s + slack). */
export const INFLIGHT_STALE_MS = 330_000;

/** `AI_ORG_MAX_INFLIGHT`, default 20. */
export function readOrgMaxInflight(): number {
  const n = Number(process.env.AI_ORG_MAX_INFLIGHT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 20;
}

/**
 * Windowed set operations. `admit` drops members older than `windowMs`, adds
 * `member` and reports the count; when the count exceeds `limit` the member is
 * removed again, so a refused attempt never occupies a slot.
 */
export interface WindowStore {
  admit(key: string, member: string, now: number, windowMs: number, limit: number): Promise<{ ok: boolean; count: number }>;
  remove(key: string, member: string): Promise<void>;
}

export function createMemoryWindowStore(): WindowStore & { clear(): void } {
  const sets = new Map<string, Map<string, number>>();
  return {
    async admit(key, member, now, windowMs, limit) {
      const set = sets.get(key) ?? new Map<string, number>();
      for (const [m, at] of set) if (at <= now - windowMs) set.delete(m);
      set.set(member, now);
      sets.set(key, set);
      const count = set.size;
      const ok = count <= limit;
      if (!ok) set.delete(member);
      return { ok, count };
    },
    async remove(key, member) {
      sets.get(key)?.delete(member);
    },
    clear() {
      sets.clear();
    },
  };
}

type Pipeline = (commands: (string | number)[][]) => Promise<unknown[]>;

export function createRedisWindowStore(pipeline: Pipeline = redisPipeline): WindowStore {
  return {
    async admit(key, member, now, windowMs, limit) {
      const out = await pipeline([
        ['ZREMRANGEBYSCORE', key, '-inf', now - windowMs],
        ['ZADD', key, now, member],
        ['ZCARD', key],
        ['PEXPIRE', key, windowMs],
      ]);
      const count = Number(out[2] ?? 0);
      const ok = count <= limit;
      if (!ok) await pipeline([['ZREM', key, member]]);
      return { ok, count };
    },
    async remove(key, member) {
      await pipeline([['ZREM', key, member]]);
    },
  };
}

/** Redis first; the in-process store when Redis is off or failing. */
function createDefaultStore(memory: WindowStore): WindowStore {
  const redis = createRedisWindowStore();
  return {
    async admit(...args) {
      if (!isRedisConfigured()) return memory.admit(...args);
      try {
        return await redis.admit(...args);
      } catch {
        return memory.admit(...args);
      }
    },
    async remove(key, member) {
      await memory.remove(key, member);
      if (!isRedisConfigured()) return;
      await redis.remove(key, member).catch(() => {});
    },
  };
}

const memoryStore = createMemoryWindowStore();
const defaultStore = createDefaultStore(memoryStore);

export type TurnAdmission =
  | { ok: true; release: () => Promise<void> }
  | { ok: false; code: 'org_busy'; message: string; retryAfterSec: number };

export async function admitAssistantTurn(
  input: { orgId: string; /** Unique per turn (the client-minted assistant message id). */ turnId: string },
  deps: { store?: WindowStore; now?: () => number; maxInflight?: number } = {},
): Promise<TurnAdmission> {
  const store = deps.store ?? defaultStore;
  const now = (deps.now ?? Date.now)();
  const max = deps.maxInflight ?? readOrgMaxInflight();
  const key = `ai:turn-inflight:${input.orgId}`;
  const slot = await store.admit(key, input.turnId, now, INFLIGHT_STALE_MS, max);
  if (!slot.ok) {
    return {
      ok: false,
      code: 'org_busy',
      message: `Your workspace already has ${max} assistant answers running at once. Try again in a few seconds.`,
      retryAfterSec: 5,
    };
  }
  let released = false;
  return {
    ok: true,
    release: async () => {
      if (released) return;
      released = true;
      await store.remove(key, input.turnId).catch(() => {});
    },
  };
}

/** Test seam — the in-process store is module-global. */
export function __resetTurnLimits(): void {
  memoryStore.clear();
}
