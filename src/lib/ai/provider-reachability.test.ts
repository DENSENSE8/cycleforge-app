/**
 * DB-free, network-free unit tests for the turn-time reachability memo.
 *
 * The whole point of the cache is that the assistant's hot path stops paying a
 * network probe per turn, so what has to be pinned is the PROBE COUNT, not just
 * the answer: a passing test that still calls fetch twice inside the TTL would
 * be testing nothing that matters.
 *
 * The second thing pinned here is what "reachable" MEANS for a self-hosted
 * brain. `GET /v1/models` answers 200 from a server whose generation thread is
 * dead (measured on the Mac's mlx_lm.server after a Metal OOM), so a local
 * endpoint has to prove it can generate a token.
 *
 * Run: node --import tsx --test src/lib/ai/provider-reachability.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isProviderReachableCached,
  resetProviderReachabilityCache,
  REACHABILITY_TTL_MS,
  REACHABILITY_FAILURE_TTL_MS,
} from './provider-reachability';
import type { AiProviderConfig } from './provider';

/** MANAGED endpoint: `/models` alone settles it (provider.ts MANAGED_AI_HOSTS). */
const CONFIG = {
  baseURL: 'https://ai-gateway.vercel.sh/v1',
  apiKey: 'k',
  model: 'test-model',
} as unknown as AiProviderConfig;

/** SELF-HOSTED endpoint: the local MLX server behind the tunnel. */
const LOCAL = {
  baseURL: 'http://127.0.0.1:8081/v1',
  apiKey: '',
  model: 'default_model',
} as unknown as AiProviderConfig;

/** Counting fake fetch: `ok` decides the probe verdict. */
function fakeFetch(ok: boolean): typeof fetch & { calls: number } {
  const impl = (async () => {
    impl.calls += 1;
    return new Response(ok ? '{"data":[]}' : 'nope', { status: ok ? 200 : 502 });
  }) as unknown as typeof fetch & { calls: number };
  impl.calls = 0;
  return impl;
}

/**
 * The wedged local server: `/models` is fine, generation never returns. The
 * abort is simulated by rejecting the way `AbortSignal.timeout` does.
 */
function wedgedFetch(): typeof fetch & { paths: string[] } {
  const impl = (async (url: string | URL) => {
    const path = String(url);
    impl.paths.push(path);
    if (path.endsWith('/models')) return new Response('{"data":[]}', { status: 200 });
    throw Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' });
  }) as unknown as typeof fetch & { paths: string[] };
  impl.paths = [];
  return impl;
}

function clockAt(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

test('a second call inside the TTL answers from cache without re-probing', async () => {
  resetProviderReachabilityCache();
  const fetchImpl = fakeFetch(true);
  const clock = clockAt();

  const first = await isProviderReachableCached(CONFIG, REACHABILITY_TTL_MS, { fetchImpl, now: clock.now });
  clock.advance(REACHABILITY_TTL_MS - 1);
  const second = await isProviderReachableCached(CONFIG, REACHABILITY_TTL_MS, { fetchImpl, now: clock.now });

  assert.equal(first, true);
  assert.equal(second, true);
  assert.equal(fetchImpl.calls, 1);
});

test('a call after the TTL re-probes the endpoint', async () => {
  resetProviderReachabilityCache();
  const fetchImpl = fakeFetch(true);
  const clock = clockAt();

  await isProviderReachableCached(CONFIG, REACHABILITY_TTL_MS, { fetchImpl, now: clock.now });
  clock.advance(REACHABILITY_TTL_MS);
  await isProviderReachableCached(CONFIG, REACHABILITY_TTL_MS, { fetchImpl, now: clock.now });

  assert.equal(fetchImpl.calls, 2);
});

test('an unreachable endpoint is cached too — the slow case is the one worth suppressing', async () => {
  resetProviderReachabilityCache();
  const fetchImpl = fakeFetch(false);
  const clock = clockAt();

  const first = await isProviderReachableCached(CONFIG, REACHABILITY_TTL_MS, { fetchImpl, now: clock.now });
  const second = await isProviderReachableCached(CONFIG, REACHABILITY_TTL_MS, { fetchImpl, now: clock.now });

  assert.equal(first, false);
  assert.equal(second, false);
  assert.equal(fetchImpl.calls, 1);
});

test('the memo is keyed per endpoint, so a second gateway is probed on its own', async () => {
  resetProviderReachabilityCache();
  const fetchImpl = fakeFetch(true);
  const clock = clockAt();

  await isProviderReachableCached(CONFIG, REACHABILITY_TTL_MS, { fetchImpl, now: clock.now });
  await isProviderReachableCached(
    { ...CONFIG, baseURL: 'https://api.openai.com/v1' },
    REACHABILITY_TTL_MS,
    { fetchImpl, now: clock.now },
  );

  assert.equal(fetchImpl.calls, 2);
});

test('a self-hosted server that answers /models but cannot generate is DOWN', async () => {
  resetProviderReachabilityCache();
  const fetchImpl = wedgedFetch();
  const clock = clockAt();

  const ok = await isProviderReachableCached(LOCAL, REACHABILITY_TTL_MS, { fetchImpl, now: clock.now });

  assert.equal(ok, false, 'a wedged local server must not keep receiving turns');
  assert.deepEqual(
    fetchImpl.paths.map((p) => p.replace(LOCAL.baseURL, '')),
    ['/models', '/chat/completions'],
    'the local probe asks the INFERENCE process, not just the HTTP layer',
  );
});

test('a managed gateway is settled by /models alone — no billed generation', async () => {
  resetProviderReachabilityCache();
  const fetchImpl = wedgedFetch();
  const clock = clockAt();

  const ok = await isProviderReachableCached(CONFIG, REACHABILITY_TTL_MS, { fetchImpl, now: clock.now });

  assert.equal(ok, true);
  assert.deepEqual(fetchImpl.paths.map((p) => p.replace(CONFIG.baseURL, '')), ['/models']);
});

test('a failure expires faster than a success, so a recovered tunnel is picked up', async () => {
  resetProviderReachabilityCache();
  const down = fakeFetch(false);
  const clock = clockAt();

  assert.equal(await isProviderReachableCached(CONFIG, REACHABILITY_TTL_MS, { fetchImpl: down, now: clock.now }), false);
  clock.advance(REACHABILITY_FAILURE_TTL_MS);
  const up = fakeFetch(true);
  assert.equal(
    await isProviderReachableCached(CONFIG, REACHABILITY_TTL_MS, { fetchImpl: up, now: clock.now }),
    true,
    'the endpoint is re-asked well before the 60s success TTL',
  );
  assert.equal(up.calls, 1);
});
