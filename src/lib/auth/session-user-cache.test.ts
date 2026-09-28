/**
 * createSessionUserCache — the brief auth-row cache in front of SESSION_USER_SQL.
 *
 * Proves: hits within the TTL skip the DB and expire after it; concurrent misses
 * share one load; a revoke/role write that lands while a load is in flight is
 * not overwritten by that load's stale row; per-sid / per-staff / global
 * invalidation; misses are never cached; the size bound holds; ttl 0 disables.
 */

import { test } from 'node:test';
import { strictEqual } from 'node:assert';
import { createSessionUserCache } from '@/lib/auth/session-user-cache';

type Row = { staff_id: number; v: string };

function harness(ttlMs = 10_000, maxEntries = 100) {
  let t = 1_000;
  const cache = createSessionUserCache<Row>({ ttlMs, maxEntries, now: () => t });
  let loads = 0;
  const loader = (row: Row | undefined) => async () => {
    loads += 1;
    return row;
  };
  return {
    cache,
    loader,
    loads: () => loads,
    advance: (ms: number) => { t += ms; },
  };
}

test('serves from cache within TTL, reloads after it', async () => {
  const h = harness();
  const a = await h.cache.get('sid1', 'cookie', h.loader({ staff_id: 1, v: 'a' }));
  const b = await h.cache.get('sid1', 'cookie', h.loader({ staff_id: 1, v: 'b' }));
  strictEqual(a?.v, 'a');
  strictEqual(b?.v, 'a');
  strictEqual(h.loads(), 1);
  h.advance(10_000);
  const c = await h.cache.get('sid1', 'cookie', h.loader({ staff_id: 1, v: 'c' }));
  strictEqual(c?.v, 'c');
  strictEqual(h.loads(), 2);
});

test('credential is part of the key', async () => {
  const h = harness();
  await h.cache.get('sid1', 'cookie', h.loader({ staff_id: 1, v: 'cookie' }));
  const bearer = await h.cache.get('sid1', 'bearer', h.loader(undefined));
  strictEqual(bearer, undefined);
});

test('concurrent misses for one key share a single load', async () => {
  const h = harness();
  let release!: (r: Row) => void;
  let loads = 0;
  const slow = () => {
    loads += 1;
    return new Promise<Row>((resolve) => { release = resolve; });
  };
  const p1 = h.cache.get('sid1', 'cookie', slow);
  const p2 = h.cache.get('sid1', 'cookie', slow);
  release({ staff_id: 1, v: 'x' });
  strictEqual((await p1)?.v, 'x');
  strictEqual((await p2)?.v, 'x');
  strictEqual(loads, 1);
});

test('invalidation during an in-flight load: the stale row is returned once but not stored', async () => {
  const h = harness();
  let release!: (r: Row) => void;
  const p = h.cache.get('sid1', 'cookie', () => new Promise<Row>((resolve) => { release = resolve; }));
  h.cache.invalidate({ sid: 'sid1' });
  release({ staff_id: 1, v: 'pre-revoke' });
  strictEqual((await p)?.v, 'pre-revoke');
  const next = await h.cache.get('sid1', 'cookie', h.loader({ staff_id: 1, v: 'post-revoke' }));
  strictEqual(next?.v, 'post-revoke');
});

test('invalidate by sid, by staff, and globally', async () => {
  const h = harness();
  await h.cache.get('a', 'cookie', h.loader({ staff_id: 1, v: 'a' }));
  await h.cache.get('b', 'cookie', h.loader({ staff_id: 1, v: 'b' }));
  await h.cache.get('c', 'cookie', h.loader({ staff_id: 2, v: 'c' }));
  h.cache.invalidate({ sid: 'a' });
  strictEqual(h.cache.size, 2);
  h.cache.invalidate({ staffId: 1 });
  strictEqual(h.cache.size, 1);
  h.cache.invalidate();
  strictEqual(h.cache.size, 0);
});

test('a missing row is never cached', async () => {
  const h = harness();
  await h.cache.get('ghost', 'cookie', h.loader(undefined));
  await h.cache.get('ghost', 'cookie', h.loader(undefined));
  strictEqual(h.loads(), 2);
});

test('size stays bounded by evicting the oldest entry', async () => {
  const h = harness(10_000, 2);
  await h.cache.get('a', 'cookie', h.loader({ staff_id: 1, v: 'a' }));
  await h.cache.get('b', 'cookie', h.loader({ staff_id: 2, v: 'b' }));
  await h.cache.get('c', 'cookie', h.loader({ staff_id: 3, v: 'c' }));
  strictEqual(h.cache.size, 2);
  const before = h.loads();
  await h.cache.get('a', 'cookie', h.loader({ staff_id: 1, v: 'a2' }));
  strictEqual(h.loads(), before + 1);
});

test('ttl 0 disables caching', async () => {
  const h = harness(0);
  await h.cache.get('a', 'cookie', h.loader({ staff_id: 1, v: 'a' }));
  await h.cache.get('a', 'cookie', h.loader({ staff_id: 1, v: 'a' }));
  strictEqual(h.loads(), 2);
  strictEqual(h.cache.size, 0);
});
