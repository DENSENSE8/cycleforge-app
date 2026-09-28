/** Network-free tests for the Upstash REST client's fetch timeout. */
import test from 'node:test';
import assert from 'node:assert/strict';

// The client reads creds and the timeout once at import: set them first.
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
process.env.REDIS_FETCH_TIMEOUT_MS = '50';

// Dynamic, not static: a static import is hoisted above the env writes (and this file compiles to CJS, so no top-level await).
const loadClient = () => import('./client');

/** A fetch that never answers on its own — only the caller's AbortSignal ends it. */
function hangingFetch() {
  const calls: { url: string; signal: AbortSignal | null }[] = [];
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal ?? null;
    calls.push({ url: String(url), signal });
    const { promise, reject } = Promise.withResolvers<Response>();
    signal?.addEventListener('abort', () => reject(signal.reason));
    return promise;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

test('a hung Upstash request aborts after REDIS_FETCH_TIMEOUT_MS and the caller gets a throw', async (t) => {
  const { redisPipeline, REDIS_FETCH_TIMEOUT_MS } = await loadClient();
  const stub = hangingFetch();
  t.mock.method(globalThis, 'fetch', stub.fetchImpl);
  assert.equal(REDIS_FETCH_TIMEOUT_MS, 50);

  const started = performance.now();
  await assert.rejects(redisPipeline([['GET', 'k']]), (err: Error) => err.name === 'TimeoutError');
  const elapsed = performance.now() - started;

  assert.equal(stub.calls.length, 1);
  assert.equal(stub.calls[0]!.url, 'https://redis.invalid/pipeline');
  assert.ok(elapsed >= 40, `aborted too early: ${elapsed}ms`);
  assert.ok(elapsed < 1_000, `bounded by the timeout, not a hang: ${elapsed}ms`);
});

test('redisCmd surfaces the same timeout instead of hanging', async (t) => {
  const { redisCmd } = await loadClient();
  t.mock.method(globalThis, 'fetch', hangingFetch().fetchImpl);
  await assert.rejects(redisCmd(['SET', 'k', '1', 'PX', '60000']), (err: Error) => err.name === 'TimeoutError');
});
