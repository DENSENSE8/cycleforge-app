/** DB-free unit tests for the turn-time reachability memo (single-flight + TTLs). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isProviderReachableCached,
  REACHABILITY_FAILURE_TTL_MS,
  REACHABILITY_TTL_MS,
  resetProviderReachabilityCache,
} from './provider-reachability';
import type { AiProviderConfig } from './provider';

const GATEWAY: AiProviderConfig = { baseURL: 'https://ai-gateway.vercel.sh/v1', apiKey: 'k', model: 'm' };

/** A `/models` endpoint whose answers the test releases by hand, counting every hit. */
function gatedModels(status: number) {
  const hits: string[] = [];
  const gates: Array<() => void> = [];
  const fetchImpl = (async (url: RequestInfo | URL) => {
    hits.push(String(url));
    const { promise, resolve } = Promise.withResolvers<void>();
    gates.push(resolve);
    await promise;
    return new Response('{}', { status });
  }) as typeof fetch;
  const release = () => gates.splice(0).forEach((open) => open());
  return { fetchImpl, hits, release };
}

test('20 concurrent cold callers share ONE probe, then the TTL expiry triggers exactly one more', async () => {
  resetProviderReachabilityCache();
  let t = 1_000;
  const endpoint = gatedModels(200);
  const deps = { fetchImpl: endpoint.fetchImpl, now: () => t };

  const burst = Array.from({ length: 20 }, () => isProviderReachableCached(GATEWAY, REACHABILITY_TTL_MS, deps));
  await Promise.resolve();
  endpoint.release();
  assert.deepEqual(await Promise.all(burst), Array(20).fill(true));
  assert.deepEqual(endpoint.hits, [`${GATEWAY.baseURL}/models`]);

  t += REACHABILITY_TTL_MS - 1;
  assert.equal(await isProviderReachableCached(GATEWAY, REACHABILITY_TTL_MS, deps), true);
  assert.equal(endpoint.hits.length, 1, 'fresh success is served from the memo');

  t += 1;
  const second = Array.from({ length: 20 }, () => isProviderReachableCached(GATEWAY, REACHABILITY_TTL_MS, deps));
  await Promise.resolve();
  endpoint.release();
  assert.deepEqual(await Promise.all(second), Array(20).fill(true));
  assert.equal(endpoint.hits.length, 2, 'expired entry → one more shared probe');
});

test('a shared FAILED probe keeps the shorter failure TTL', async () => {
  resetProviderReachabilityCache();
  let t = 1_000;
  const endpoint = gatedModels(503);
  const deps = { fetchImpl: endpoint.fetchImpl, now: () => t };

  const burst = Array.from({ length: 5 }, () => isProviderReachableCached(GATEWAY, REACHABILITY_TTL_MS, deps));
  await Promise.resolve();
  endpoint.release();
  assert.deepEqual(await Promise.all(burst), Array(5).fill(false));
  assert.equal(endpoint.hits.length, 1);

  t += REACHABILITY_FAILURE_TTL_MS - 1;
  assert.equal(await isProviderReachableCached(GATEWAY, REACHABILITY_TTL_MS, deps), false);
  assert.equal(endpoint.hits.length, 1);

  t += 1;
  const retry = isProviderReachableCached(GATEWAY, REACHABILITY_TTL_MS, deps);
  await Promise.resolve();
  endpoint.release();
  assert.equal(await retry, false);
  assert.equal(endpoint.hits.length, 2, 'failure re-probed after 5s, not 60s');
});

test('different base URLs do not share a probe', async () => {
  resetProviderReachabilityCache();
  const endpoint = gatedModels(200);
  const deps = { fetchImpl: endpoint.fetchImpl, now: () => 1_000 };
  const other: AiProviderConfig = { ...GATEWAY, baseURL: 'https://api.openai.com/v1' };

  const both = Promise.all([
    isProviderReachableCached(GATEWAY, REACHABILITY_TTL_MS, deps),
    isProviderReachableCached(other, REACHABILITY_TTL_MS, deps),
  ]);
  await Promise.resolve();
  endpoint.release();
  assert.deepEqual(await both, [true, true]);
  assert.deepEqual(endpoint.hits.sort(), ['https://ai-gateway.vercel.sh/v1/models', 'https://api.openai.com/v1/models']);
});
