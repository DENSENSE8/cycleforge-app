/**
 * Rate limiter — distributed via Upstash Redis. There is an in-memory `Map`
 * fallback for local development only: each Lambda instance has its own Map,
 * so the effective limit is `limit × instances` and it is NOT a limiter under
 * Vercel's autoscaler.
 *
 * Public API is unchanged — `checkRateLimit({ headers, routeKey, limit,
 * windowMs })` still returns `{ ok, retryAfterSec? }`. The new
 * `checkRateLimitAsync` variant uses the distributed backend; the sync
 * `checkRateLimit` keeps the in-memory path so legacy callsites don't break,
 * but new code should prefer the async form.
 *
 * Backend selection (see `@/lib/redis/client`): either
 * `UPSTASH_REDIS_REST_URL`/`_TOKEN` or `KV_REST_API_URL`/`_TOKEN` lights up
 * Redis; otherwise the backend is unconfigured.
 *
 * Degradation policy — the limiter FAILS CLOSED in production. When Redis is
 * unconfigured or a Redis call throws, `checkRateLimitAsync` returns
 * `{ ok: false, retryAfterSec: 30 }` instead of degrading to the per-instance
 * Map, because "Redis unreachable / over quota" is exactly the state an
 * attacker creates. Outside production the default stays `'open'` (in-memory)
 * so local work is unaffected; either default is overridable per call via
 * `failMode`. An unconfigured backend in production is a hard boot error.
 */

import { isRedisConfigured, redisPipeline } from '@/lib/redis/client';

const REDIS_PREFIX = 'rl:v1:';

/** True when this process serves production traffic (Vercel prod or NODE_ENV=production). */
const IS_PRODUCTION_RUNTIME =
  process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

/** Retry-After handed to callers when the limiter is degraded and failing closed. */
const FAIL_CLOSED_RETRY_AFTER_SEC = 30;

// Fail closed at boot, not per request: in production an unconfigured Redis
// means there is no cross-instance limiter at all, so every IP-keyed throttle
// (signin, PIN, password reset) is really `limit × instances`. isRedisConfigured()
// is satisfied by EITHER UPSTASH_REDIS_REST_* or KV_REST_API_* (redis/client.ts
// resolveRedisRestCreds), so this only trips when both pairs are absent.
// Skipped during `next build` — the build container legitimately has no runtime
// env, and a build-time throw would only mask the deploy-time signal.
if (
  !isRedisConfigured() &&
  IS_PRODUCTION_RUNTIME &&
  process.env.NEXT_PHASE !== 'phase-production-build'
) {
  throw new Error(
    '[api-guard] No Upstash REST credentials in production (checked UPSTASH_REDIS_REST_URL/_TOKEN ' +
      'and KV_REST_API_URL/_TOKEN). Distributed rate limiting would be INEFFECTIVE under ' +
      'autoscale, so the limiter refuses to boot. Configure Upstash Redis / Vercel KV.',
  );
}

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Caller IP taken only from headers our own ingress writes — never the
 * caller-chosen leftmost `x-forwarded-for` hop — so limiter keys cannot be
 * rotated and audit IPs cannot be forged by a client that sets XFF itself.
 * Resolution order: `x-vercel-forwarded-for`, `x-real-ip`, then the LAST
 * `x-forwarded-for` element (the hop appended by our ingress).
 */
export function clientIp(headers: Headers): string {
  const vercel = headers.get('x-vercel-forwarded-for')?.split(',').pop()?.trim();
  if (vercel) return vercel;

  const real = headers.get('x-real-ip')?.trim();
  if (real) return real;

  const lastHop = headers.get('x-forwarded-for')?.split(',').pop()?.trim();
  if (lastHop) return lastHop;

  return 'unknown';
}

/**
 * Same trusted resolution as `clientIp`, but yields `null` instead of the
 * `'unknown'` sentinel — audit sinks (`auth_audit.ip`, `audit_logs.ip_address`)
 * store NULL rather than a literal when no ingress header is present.
 */
export function clientIpOrNull(headers: Headers): string | null {
  const ip = clientIp(headers);
  return ip === 'unknown' ? null : ip;
}

export interface RateLimitOptions {
  headers: Headers;
  routeKey: string;
  limit: number;
  windowMs: number;
  /** Optional extra identifier (e.g. orgId, staffId) to scope the limit. */
  scope?: string | number | null;
  /**
   * What to do when the distributed backend is unavailable (unconfigured, or
   * the Redis call threw). `'closed'` → 429 with a 30s Retry-After;
   * `'open'` → per-instance in-memory Map. Default: `'closed'` in production,
   * `'open'` everywhere else.
   */
  failMode?: 'open' | 'closed';
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec?: number;
}

function buildKey(opts: RateLimitOptions): string {
  const ip = clientIp(opts.headers);
  const scope = opts.scope == null ? '' : `:${opts.scope}`;
  return `${opts.routeKey}${scope}:${ip}`;
}

/**
 * Legacy synchronous in-memory limiter. Kept for backwards compatibility
 * with existing callsites. Migrate to checkRateLimitAsync when convenient —
 * the async variant is the only one safe across Vercel/serverless instances.
 */
export function checkRateLimit(opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const key = buildKey(opts);

  const current = rateLimitStore.get(key);
  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true };
  }

  if (current.count >= opts.limit) {
    return { ok: false, retryAfterSec: Math.ceil((current.resetAt - now) / 1000) };
  }

  current.count += 1;
  rateLimitStore.set(key, current);
  return { ok: true };
}

/**
 * Distributed sliding-window limiter. Uses Redis ZSET semantics: each call
 * appends now-ms as a score, expires old entries past windowMs, counts the
 * remaining elements. When Redis is unconfigured or the call throws, the
 * `failMode` policy decides: `'closed'` (production default) rejects with a
 * 30s Retry-After; `'open'` (dev default) degrades to the in-memory Map.
 */
export async function checkRateLimitAsync(opts: RateLimitOptions): Promise<RateLimitResult> {
  const failClosed = (opts.failMode ?? (IS_PRODUCTION_RUNTIME ? 'closed' : 'open')) === 'closed';

  if (!isRedisConfigured()) {
    if (!failClosed) return checkRateLimit(opts);
    console.error(
      `[api-guard] redis unconfigured — failing closed on routeKey=${opts.routeKey}`,
    );
    return { ok: false, retryAfterSec: FAIL_CLOSED_RETRY_AFTER_SEC };
  }

  const now = Date.now();
  const key = `${REDIS_PREFIX}${buildKey(opts)}`;
  const cutoff = now - opts.windowMs;
  const member = `${now}:${Math.random().toString(36).slice(2, 10)}`;

  try {
    const results = await redisPipeline([
      ['ZREMRANGEBYSCORE', key, '-inf', String(cutoff)],
      ['ZADD', key, String(now), member],
      ['ZCARD', key],
      ['PEXPIRE', key, String(opts.windowMs)],
    ]);

    const count = Number(results[2] ?? 0);

    if (count > opts.limit) {
      return { ok: false, retryAfterSec: Math.ceil(opts.windowMs / 1000) };
    }
    return { ok: true };
  } catch (err) {
    console.warn('[api-guard] redis call failed:', err instanceof Error ? err.message : err);
    if (!failClosed) return checkRateLimit(opts);
    return { ok: false, retryAfterSec: FAIL_CLOSED_RETRY_AFTER_SEC };
  }
}

/**
 * Org-scoped rate limit for authed routes. Combines the IP dimension (within-
 * tenant abuse) with the tenant org so one noisy tenant can't exhaust another
 * tenant's budget on a shared routeKey. Prefer this on withAuth routes — pass
 * `ctx.organizationId`. Public / pre-auth routes (e.g. auth/signup) stay
 * IP-only via `checkRateLimitAsync`. See tenancy exec plan §D5.
 */
export function checkRateLimitForOrg(
  opts: Omit<RateLimitOptions, 'scope'> & { organizationId: string },
): Promise<RateLimitResult> {
  return checkRateLimitAsync({ ...opts, scope: opts.organizationId });
}
