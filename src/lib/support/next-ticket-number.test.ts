/**
 * Draft ticket number — the prediction, and the honesty around it.
 *
 *   node --import tsx --test src/lib/support/next-ticket-number.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDraftTicketNumber,
  predictNextTicketNumber,
} from './next-ticket-number';

test('the prediction is the newest id plus one', () => {
  assert.deepEqual(predictNextTicketNumber([{ id: 9130 }]), {
    predicted: 9131,
    observedLatest: 9130,
  });
});

test('MAX id wins, not the first row', () => {
  // The list is sorted by created_at. A ticket created earlier can surface
  // ahead of a newer one; only the sequence maximum is meaningful.
  assert.deepEqual(
    predictNextTicketNumber([{ id: 5 }, { id: 9130 }, { id: 12 }]),
    { predicted: 9131, observedLatest: 9130 },
  );
});

test('junk ids are skipped rather than poisoning the max', () => {
  assert.deepEqual(
    predictNextTicketNumber([{ id: null }, { id: undefined }, { id: 40 }]),
    { predicted: 41, observedLatest: 40 },
  );
});

test('an account with no tickets answers UNKNOWN, never #1', () => {
  // Where a fresh account's sequence starts is not ours to guess, and a wrong
  // number in this slot is one an operator could read out to a seller.
  assert.equal(predictNextTicketNumber([]), null);
  assert.equal(predictNextTicketNumber([{ id: 0 }, { id: -3 }]), null);
});

test('the face is the bare number — no # and no ~ — and unknown has no face', () => {
  assert.equal(formatDraftTicketNumber({ predicted: 9131, observedLatest: 9130 }), '9131');
  assert.equal(formatDraftTicketNumber(null), null);
});
