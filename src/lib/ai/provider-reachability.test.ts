/**
 * DB-free, network-free unit tests for the turn-time reachability memo.
 *
 * The whole point of the cache is that the assistant's hot path stops paying a
 * 2s network probe per turn, so what has to be pinned is the PROBE COUNT, not
 * just the answer: a passing test that still calls fetch twice inside the TTL
 * would be testing nothing that matters.
 *
 * Run: node --import tsx --test src/lib/ai/provider-reachability.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isProviderReachableCached,
  resetProviderReachabilityCache,
  REACHABILITY_TTL_MS,
} from './provider-reachability';
import type { AiProviderConfig } from './provider';

const CONFIG = {
  baseURL: 'https://gateway.example/v1',
  apiKey: 'k',
  model: 'test-model',
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
    { ...CONFIG, baseURL: 'https://other.example/v1' },
    REACHABILITY_TTL_MS,
    { fetchImpl, now: clock.now },
  );

  assert.equal(fetchImpl.calls, 2);
});
