import test from 'node:test';
import assert from 'node:assert/strict';
import { IDENTIFY_TIERS, compareCandidates, contextLevel, type RankKey } from './rank';

const key = (over: Partial<RankKey>): RankKey => ({
  kind: 'order',
  entityId: 1,
  tier: IDENTIFY_TIERS.keyword,
  contextLevel: 0,
  score: 0.5,
  happenedAt: null,
  ...over,
});

const order = (keys: RankKey[]) => [...keys].sort(compareCandidates).map((k) => `${k.kind}:${k.entityId}`);

test('tier beats context and score: an exact hit outside the page outranks a strong in-context keyword hit', () => {
  const exact = key({ kind: 'sku', entityId: 9, tier: IDENTIFY_TIERS.exact, score: 0.9 });
  const keyword = key({ kind: 'order', entityId: 1, contextLevel: 2, score: 5 });
  assert.deepEqual(order([keyword, exact]), ['sku:9', 'order:1']);
});

test('inside a tier the caller context ranks first, the matching stage above the page', () => {
  const page = key({ entityId: 1, contextLevel: 1, score: 0.1 });
  const stage = key({ entityId: 2, contextLevel: 2, score: 0.1 });
  const global = key({ entityId: 3, contextLevel: 0, score: 9 });
  assert.deepEqual(order([global, page, stage]), ['order:2', 'order:1', 'order:3']);
});

test('ties on score break by recency, and a record with no date sorts last', () => {
  const old = key({ entityId: 1, happenedAt: Date.UTC(2026, 0, 1) });
  const recent = key({ entityId: 2, happenedAt: Date.UTC(2026, 8, 1) });
  const undated = key({ entityId: 3, happenedAt: null });
  assert.deepEqual(order([undated, old, recent]), ['order:2', 'order:1', 'order:3']);
});

test('full ties break by kind order, then the lower id — the same answer for any input order', () => {
  const tied = [
    key({ kind: 'sku', entityId: 4 }),
    key({ kind: 'order', entityId: 7 }),
    key({ kind: 'order', entityId: 3 }),
    key({ kind: 'unit', entityId: 1 }),
  ];
  const expected = ['order:3', 'order:7', 'unit:1', 'sku:4'];
  assert.deepEqual(order(tied), expected);
  assert.deepEqual(order([...tied].reverse()), expected);
  assert.deepEqual(order([tied[2], tied[0], tied[3], tied[1]]), expected);
});

test('context level: kind outside the scope is 0, page match 1, page + section stage 2', () => {
  const scope = { kinds: ['order'] as const, stage: 'exception' as const };
  assert.equal(contextLevel(scope, { kind: 'sku', stage: null }), 0);
  assert.equal(contextLevel(scope, { kind: 'order', stage: 'shipped' }), 1);
  assert.equal(contextLevel(scope, { kind: 'order', stage: 'exception' }), 2);
  assert.equal(contextLevel(null, { kind: 'order', stage: 'exception' }), 0);
});
