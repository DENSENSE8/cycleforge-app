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

function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip') || 'unknown';
}

export interface RateLimitOptions {
  headers: Headers;
  routeKey: string;
  limit: number;
  windowMs: number;
  /** Optional extra identifier (e.g. orgId, staffId) to scope the limit. */
  scope?: string | number | null;
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec?: number;
}

function buildKey(opts: RateLimitOptions): string {
  const ip = getClientIp(opts.headers);
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

/** Org-scoped rate limit for authed routes. */
export function checkRateLimitForOrg(
  opts: Omit<RateLimitOptions, 'scope'> & { organizationId: string },
): Promise<RateLimitResult> {
  return checkRateLimitAsync({ ...opts, scope: opts.organizationId });
}
