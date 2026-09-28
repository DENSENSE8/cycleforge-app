/** Rate limiter — distributed when Upstash Redis is configured, in-memory fallback otherwise. */

import { isRedisConfigured, redisPipeline } from '@/lib/redis/client';

const REDIS_PREFIX = 'rl:v1:';

// Loud boot warning:
if (!isRedisConfigured() && (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production')) {
  console.warn(
    '[api-guard] UPSTASH_REDIS_REST_URL/_TOKEN are not set in production — rate limiting is falling back to per-instance in-memory and is INEFFECTIVE under autoscale. Configure Upstash Redis.',
  );
}

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Per-IP ceiling for sign-in style routes over a 10-minute window. Sized so a
 * whole warehouse shift behind one NAT can sign in; the tight limits on these
 * routes are per identity (`ipAgnostic` + staff/email scope) and the PIN lockout.
 */
export const AUTH_PER_IP_LIMIT_PER_10_MIN = 300;

function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip') || 'unknown';
}

interface RateLimitOptions {
  headers: Headers;
  routeKey: string;
  limit: number;
  windowMs: number;
  /** Optional extra identifier (e.g. orgId, staffId) to scope the limit. */
  scope?: string | number | null;
  /**
   * Key on `scope` alone instead of `scope` + client IP. Use for per-identity
   * limits (`${orgId}:${staffId}`, an email): a warehouse behind one NAT no
   * longer shares one bucket, and an attacker rotating IPs gets no fresh one.
   * Ignored when `scope` is null.
   */
  ipAgnostic?: boolean;
}

interface RateLimitResult {
  ok: boolean;
  retryAfterSec?: number;
}

function buildKey(opts: RateLimitOptions): string {
  if (opts.ipAgnostic && opts.scope != null) return `${opts.routeKey}:id:${opts.scope}`;
  const ip = getClientIp(opts.headers);
  const scope = opts.scope == null ? '' : `:${opts.scope}`;
  return `${opts.routeKey}${scope}:${ip}`;
}

/**
 * Legacy synchronous in-memory limiter. Kept for backwards compatibility
 * with existing callsites. Migrate to checkRateLimitAsync when convenient —
 * the async variant is the only one safe across Vercel/serverless instances.
 */
function checkRateLimit(opts: RateLimitOptions): RateLimitResult {
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

/** Distributed sliding-window limiter. */
export async function checkRateLimitAsync(opts: RateLimitOptions): Promise<RateLimitResult> {
  if (!isRedisConfigured()) return checkRateLimit(opts);

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
    return checkRateLimit(opts);
  }
}

/**
 * Rate limit for authed routes. With `staffId` the bucket is that staff member
 * in that org, whatever their IP (a shared warehouse NAT no longer pools a
 * whole shift into one bucket); without it, the legacy org + IP bucket.
 */
export function checkRateLimitForOrg(
  opts: Omit<RateLimitOptions, 'scope' | 'ipAgnostic'> & { organizationId: string; staffId?: number | null },
): Promise<RateLimitResult> {
  const { organizationId, staffId, ...rest } = opts;
  return checkRateLimitAsync(
    staffId == null
      ? { ...rest, scope: organizationId }
      : { ...rest, scope: `${organizationId}:${staffId}`, ipAgnostic: true },
  );
}
