// Buckets are local-calendar based; pin a zone with DST so the 23h / 25h days
// are real. Must be set before the first Date is constructed.
process.env.TZ = 'America/New_York';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupSessionsByRecency, type SessionGroupKey } from './session-groups';

const local = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0, ms = 0) =>
  new Date(y, mo - 1, d, h, mi, s, ms);
const row = (id: string, at: Date | string) => ({
  id,
  updatedAt: typeof at === 'string' ? at : at.toISOString(),
});

function bucketOf(at: Date | string, now: Date): SessionGroupKey {
  const groups = groupSessionsByRecency([row('x', at)], now);
  assert.equal(groups.length, 1);
  return groups[0]!.key;
}

test('local midnight is the Today/Yesterday edge, to the millisecond', () => {
  const now = local(2026, 6, 15, 0, 0, 0, 0);
  assert.equal(bucketOf(local(2026, 6, 15, 0, 0, 0, 0), now), 'today');
  assert.equal(bucketOf(local(2026, 6, 14, 23, 59, 59, 999), now), 'yesterday');
  assert.equal(bucketOf(local(2026, 6, 14, 0, 0, 0, 0), now), 'yesterday');
  assert.equal(bucketOf(local(2026, 6, 13, 23, 59, 59, 999), now), 'week');
});

test('7- and 30-day edges are calendar midnights', () => {
  const now = local(2026, 6, 15, 18, 0);
  assert.equal(bucketOf(local(2026, 6, 8, 0, 0), now), 'week');
  assert.equal(bucketOf(local(2026, 6, 7, 23, 59, 59, 999), now), 'month');
  assert.equal(bucketOf(local(2026, 5, 16, 0, 0), now), 'month');
  assert.equal(bucketOf(local(2026, 5, 15, 23, 59, 59, 999), now), 'older');
});

test('spring-forward (23h day): a late-evening thread two days back is not Yesterday', () => {
  // 2026-03-08 is 23h long in New York. now - 24h would reach back to 23:30 on the 7th.
  const now = local(2026, 3, 9, 0, 30);
  assert.equal(bucketOf(local(2026, 3, 8, 0, 10), now), 'yesterday');
  assert.equal(bucketOf(local(2026, 3, 7, 23, 45), now), 'week');
});

test('fall-back (25h day): the first hour of yesterday is still Yesterday', () => {
  // 2026-11-01 is 25h long in New York. now - 24h (from midnight) would start at 01:00 EST.
  const now = local(2026, 11, 2, 10, 0);
  assert.equal(bucketOf(local(2026, 11, 1, 0, 30), now), 'yesterday');
  assert.equal(bucketOf(local(2026, 10, 31, 23, 59), now), 'week');
});

test('keeps input order inside a bucket, omits empty buckets, labels in fixed order', () => {
  const now = local(2026, 6, 15, 12, 0);
  const groups = groupSessionsByRecency(
    [
      row('a', local(2026, 6, 15, 11, 0)),
      row('b', local(2026, 6, 15, 9, 0)),
      row('c', local(2025, 1, 1)),
    ],
    now,
  );
  assert.deepEqual(
    groups.map((g) => [g.label, g.rows.map((r) => r.id)]),
    [
      ['Today', ['a', 'b']],
      ['Older', ['c']],
    ],
  );
});

test('clock-skewed future rows read as Today; unparseable rows fall to Older', () => {
  const now = local(2026, 6, 15, 12, 0);
  assert.equal(bucketOf(local(2026, 6, 16, 9, 0), now), 'today');
  assert.equal(bucketOf('not-a-date', now), 'older');
});
