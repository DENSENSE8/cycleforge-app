import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeTaskFollowUp } from './task-follow-ups';

const NOW = Date.parse('2026-09-29T12:00:00.000Z');

test('a NEW email follow-up is refused (emails are linked under Links); call / note / ticket log', () => {
  assert.deepEqual(normalizeTaskFollowUp({ channel: 'email', body: 'Checking in' }, NOW), {
    ok: false,
    reason: 'email_is_a_link',
  });
  // A call needs no words.
  assert.equal(normalizeTaskFollowUp({ channel: 'call' }, NOW).ok, true);
  assert.equal(normalizeTaskFollowUp({ channel: 'note', body: 'Left a voicemail' }, NOW).ok, true);
  assert.equal(normalizeTaskFollowUp({ channel: 'ticket' }, NOW).ok, true);
});

test('occurredAt: defaults to now, tolerates 5 min of clock skew, refuses beyond it', () => {
  const r = normalizeTaskFollowUp({ channel: 'note' }, NOW);
  assert.ok(r.ok);
  assert.equal(r.value.occurredAt, new Date(NOW).toISOString());

  const skew = new Date(NOW + 5 * 60_000).toISOString();
  assert.equal(normalizeTaskFollowUp({ channel: 'note', occurredAt: skew }, NOW).ok, true);

  const future = new Date(NOW + 5 * 60_000 + 1).toISOString();
  assert.deepEqual(normalizeTaskFollowUp({ channel: 'note', occurredAt: future }, NOW), {
    ok: false,
    reason: 'occurred_in_future',
  });
  assert.deepEqual(normalizeTaskFollowUp({ channel: 'note', occurredAt: 'yesterday-ish' }, NOW), {
    ok: false,
    reason: 'invalid_instant',
  });
});

test('nextFollowUpAt: absent leaves it alone, null clears, a value sets', () => {
  const absent = normalizeTaskFollowUp({ channel: 'call' }, NOW);
  assert.ok(absent.ok && absent.value.nextFollowUpAt === undefined);
  const cleared = normalizeTaskFollowUp({ channel: 'call', nextFollowUpAt: null }, NOW);
  assert.ok(cleared.ok && cleared.value.nextFollowUpAt === null);
  const set = normalizeTaskFollowUp({ channel: 'call', nextFollowUpAt: '2026-10-01T09:00:00Z' }, NOW);
  assert.ok(set.ok && set.value.nextFollowUpAt === '2026-10-01T09:00:00.000Z');
});
