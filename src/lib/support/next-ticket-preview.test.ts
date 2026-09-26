/** The support-ticket preview shown on the repair paperwork. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { previewNextSupportTicketId, projectNextTicketId } from './next-ticket-preview';

test('the projection is the newest id plus one', () => {
  assert.equal(projectNextTicketId(9347), 9348);
  assert.equal(projectNextTicketId(1), 2);
});

/**
 * An account with no tickets gives nothing to count from. Returning `#1` would
 * be a guess dressed as a fact, and it would print on a customer's paperwork.
 */
test('nothing to count from yields no preview, never an invented #1', () => {
  assert.equal(projectNextTicketId(null), null);
  assert.equal(projectNextTicketId(undefined), null);
  assert.equal(projectNextTicketId(0), null);
  assert.equal(projectNextTicketId(-5), null);
  assert.equal(projectNextTicketId(Number.NaN), null);
  assert.equal(projectNextTicketId(Number.POSITIVE_INFINITY), null);
});

test('a fractional id from a sloppy provider payload is floored, not rounded up', () => {
  // 9347.9 is not ticket 9348 — it is ticket 9347 mis-serialized.
  assert.equal(projectNextTicketId(9347.9), 9348);
});

test('a helpdesk failure is a missing preview, never a broken counter', async () => {
  const seen: unknown[] = [];
  const preview = await previewNextSupportTicketId({
    newestTicketId: () => Promise.reject(new Error('401 from the provider')),
    onError: (error) => seen.push(error),
  });
  assert.equal(preview, null);
  assert.equal(seen.length, 1, 'the failure must still be loud in the log');
});

test('an org with no helpdesk configured simply shows no number', async () => {
  assert.equal(
    await previewNextSupportTicketId({ newestTicketId: async () => null }),
    null,
  );
  assert.equal(
    await previewNextSupportTicketId({ newestTicketId: async () => 4242 }),
    4243,
  );
});
