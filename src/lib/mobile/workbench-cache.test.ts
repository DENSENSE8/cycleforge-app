import assert from 'node:assert/strict';
import test from 'node:test';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import {
  readWorkbenchCache,
  serializeWorkbenchCache,
  WORKBENCH_CACHE_BUSTER,
  WORKBENCH_CACHE_MAX_AGE_MS,
  workbenchCacheKey,
} from './workbench-cache';

const NOW = Date.parse('2026-09-24T18:00:00Z');
const STAFF_1 = workbenchCacheKey({ organizationId: 'org-a', staffId: 1 });

function query(queryKey: unknown[], data: unknown) {
  return {
    queryKey,
    queryHash: JSON.stringify(queryKey),
    state: {
      data,
      dataUpdateCount: 1,
      dataUpdatedAt: NOW - 1000,
      error: null,
      errorUpdateCount: 0,
      errorUpdatedAt: 0,
      fetchFailureCount: 0,
      fetchFailureReason: null,
      fetchMeta: null,
      isInvalidated: false,
      status: 'success',
      fetchStatus: 'idle',
    },
  };
}

function client(overrides: Partial<PersistedClient> = {}): PersistedClient {
  return {
    timestamp: NOW - 60_000,
    buster: WORKBENCH_CACHE_BUSTER,
    clientState: {
      mutations: [],
      queries: [query(['repairs', 'workbench', 4799, 'record'], { id: 4799, status: 'In Progress' })],
    },
    ...overrides,
  } as PersistedClient;
}

test('a valid entry for the same identity restores its workbench queries', () => {
  const restored = readWorkbenchCache(serializeWorkbenchCache(client(), STAFF_1), STAFF_1, NOW);
  assert.ok(restored);
  assert.deepEqual(
    restored.clientState.queries.map((q) => [q.queryKey, q.state.data]),
    [[['repairs', 'workbench', 4799, 'record'], { id: 4799, status: 'In Progress' }]],
  );
});

test('an entry written for another staff or org never restores', () => {
  const raw = serializeWorkbenchCache(client(), STAFF_1);
  assert.equal(readWorkbenchCache(raw, workbenchCacheKey({ organizationId: 'org-a', staffId: 2 }), NOW), null);
  assert.equal(readWorkbenchCache(raw, workbenchCacheKey({ organizationId: 'org-b', staffId: 1 }), NOW), null);
});

test('a different buster is treated as empty', () => {
  const raw = serializeWorkbenchCache(client({ buster: 'wb-v0' }), STAFF_1);
  assert.equal(readWorkbenchCache(raw, STAFF_1, NOW), null);
});

test('entries restore up to exactly 24h old and not a millisecond after', () => {
  const written = NOW - WORKBENCH_CACHE_MAX_AGE_MS;
  const raw = serializeWorkbenchCache(client({ timestamp: written }), STAFF_1);
  assert.ok(readWorkbenchCache(raw, STAFF_1, NOW));
  assert.equal(readWorkbenchCache(raw, STAFF_1, NOW + 1), null);
});

test('missing, corrupt or shapeless entries are empty, not errors', () => {
  assert.equal(readWorkbenchCache(null, STAFF_1, NOW), null);
  assert.equal(readWorkbenchCache('{not json', STAFF_1, NOW), null);
  assert.equal(readWorkbenchCache(JSON.stringify({ owner: STAFF_1, buster: WORKBENCH_CACHE_BUSTER }), STAFF_1, NOW), null);
});

test('queries outside the workbench and stored mutations are never restored', () => {
  const raw = serializeWorkbenchCache(
    client({
      clientState: {
        mutations: [{ mutationKey: ['x'], state: {} }],
        queries: [
          query(['repairs', 'list'], ['leak']),
          query(['staff', 'me'], { id: 9 }),
          query(['repairs', 'workbench', 4799, 'photos'], []),
        ],
      } as unknown as PersistedClient['clientState'],
    }),
    STAFF_1,
  );
  const restored = readWorkbenchCache(raw, STAFF_1, NOW);
  assert.ok(restored);
  assert.deepEqual(restored.clientState.mutations, []);
  assert.deepEqual(
    restored.clientState.queries.map((q) => q.queryKey),
    [['repairs', 'workbench', 4799, 'photos']],
  );
});
