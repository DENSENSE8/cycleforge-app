/** Consolidated Upstash Redis REST client (Phase 0.1 of the Redis caching plan). */
export type RedisCommand = (string | number)[];

/** Resolve Upstash REST credentials from EITHER naming convention. */
export function resolveRedisRestCreds(
  env: Record<string, string | undefined> = process.env,
): { url: string; token: string } {
  const url = (env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || '').replace(/\/+$/, '');
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || '';
  return { url, token };
}

const { url: REST_URL, token: REST_TOKEN } = resolveRedisRestCreds();

export function isRedisConfigured(): boolean {
  return Boolean(REST_URL && REST_TOKEN);
}

/** The resolved REST target ({ url, token }). */
export function redisRestTarget(): { url: string; token: string } {
  return { url: REST_URL, token: REST_TOKEN };
}

// Loud, once-per-process tripwire:
if (typeof window === 'undefined' && !isRedisConfigured() && process.env.NODE_ENV !== 'test') {
  console.warn(
    '[redis] No Upstash REST creds found (checked UPSTASH_REDIS_REST_URL/TOKEN and ' +
      'KV_REST_API_URL/TOKEN). Cache, distributed rate limiting, and workflow locks ' +
      'are DISABLED — all paths run their DB / in-memory fallback.',
  );
}

function pipelineUrl(): string {
  return `${REST_URL}/pipeline`;
}

/** Execute N Redis commands in one pipeline HTTP round-trip. */
export async function redisPipeline<T = unknown>(commands: RedisCommand[]): Promise<(T | null)[]> {
  if (!isRedisConfigured() || commands.length === 0) return [];
  const res = await fetch(pipelineUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`upstash pipeline failed: ${res.status}`);
  const data = (await res.json()) as Array<{ result?: unknown; error?: string }>;
  if (!Array.isArray(data)) return [];
  return data.map((item) => {
    if (item?.error) throw new Error(item.error);
    return (item?.result as T) ?? null;
  });
}

/**
 * Execute a single Redis command; returns its result (null for a null result,
 * null when unconfigured). Throws on HTTP failure or a Redis-level error.
 */
export async function redisCmd<T = unknown>(command: RedisCommand): Promise<T | null> {
  if (!isRedisConfigured()) return null;
  const [first] = await redisPipeline<T>([command]);
  return first ?? null;
}
