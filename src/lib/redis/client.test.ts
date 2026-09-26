import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveRedisRestCreds } from './client';

// Guards the 2026-07 regression:

test('resolveRedisRestCreds: Upstash-native names resolve', () => {
  const { url, token } = resolveRedisRestCreds({
    UPSTASH_REDIS_REST_URL: 'https://x.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'up-tok',
  });
  assert.equal(url, 'https://x.upstash.io');
  assert.equal(token, 'up-tok');
});

test('resolveRedisRestCreds: Vercel-KV names resolve (the regression case)', () => {
  const { url, token } = resolveRedisRestCreds({
    KV_REST_API_URL: 'https://kv.upstash.io',
    KV_REST_API_TOKEN: 'kv-tok',
  });
  assert.equal(url, 'https://kv.upstash.io');
  assert.equal(token, 'kv-tok');
});

test('resolveRedisRestCreds: UPSTASH_* wins when both conventions are set', () => {
  const { url, token } = resolveRedisRestCreds({
    UPSTASH_REDIS_REST_URL: 'https://up.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'up-tok',
    KV_REST_API_URL: 'https://kv.upstash.io',
    KV_REST_API_TOKEN: 'kv-tok',
  });
  assert.equal(url, 'https://up.upstash.io');
  assert.equal(token, 'up-tok');
});

test('resolveRedisRestCreds: never uses the read-only token', () => {
  // KV_REST_API_READ_ONLY_TOKEN can't SET — must not be picked up as the token.
  const { url, token } = resolveRedisRestCreds({
    KV_REST_API_URL: 'https://kv.upstash.io',
    KV_REST_API_READ_ONLY_TOKEN: 'ro-tok',
  });
  assert.equal(url, 'https://kv.upstash.io');
  assert.equal(token, '');
});

test('resolveRedisRestCreds: strips a trailing slash from the url', () => {
  const { url } = resolveRedisRestCreds({
    KV_REST_API_URL: 'https://kv.upstash.io/',
    KV_REST_API_TOKEN: 'kv-tok',
  });
  assert.equal(url, 'https://kv.upstash.io');
});

test('resolveRedisRestCreds: unconfigured env → empty strings (fail-open)', () => {
  const { url, token } = resolveRedisRestCreds({});
  assert.equal(url, '');
  assert.equal(token, '');
});
