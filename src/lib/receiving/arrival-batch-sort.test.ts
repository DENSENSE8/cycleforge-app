/**
 * Pure Arrival batch-sort bag helpers.
 *
 * Run: `npx tsx --test src/lib/receiving/arrival-batch-sort.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pushArrivalBatchEntry,
  removeArrivalBatchEntry,
  type ArrivalBatchEntry,
} from './arrival-batch-sort';

const base = (id: number, tracking = `T-${id}`): ArrivalBatchEntry => ({
  tracking,
  receivingId: id,
  label: tracking,
  isReturn: false,
  isPriority: false,
  priorityLane: null,
});

test('pushArrivalBatchEntry appends and dedupes by receivingId', () => {
  const a = pushArrivalBatchEntry([], base(10));
  assert.equal(a.length, 1);
  const b = pushArrivalBatchEntry(a, base(10, 'OTHER'));
  assert.equal(b, a, 'same reference when duplicate');
  assert.equal(b[0].tracking, 'T-10');
  const c = pushArrivalBatchEntry(b, base(11));
  assert.equal(c.length, 2);
});

test('pushArrivalBatchEntry rejects non-positive receivingId', () => {
  assert.deepEqual(pushArrivalBatchEntry([], base(0)), []);
  assert.deepEqual(pushArrivalBatchEntry([], base(-1)), []);
});

test('removeArrivalBatchEntry drops by receivingId', () => {
  const batch = pushArrivalBatchEntry(pushArrivalBatchEntry([], base(1)), base(2));
  assert.deepEqual(
    removeArrivalBatchEntry(batch, 1).map((e) => e.receivingId),
    [2],
  );
  assert.equal(removeArrivalBatchEntry(batch, 99), batch);
});
