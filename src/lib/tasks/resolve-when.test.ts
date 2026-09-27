/**
 *   npx tsx --test src/lib/tasks/resolve-when.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveWhen } from './resolve-when';

const TZ = 'America/Los_Angeles';
// Saturday 2026-09-26 10:00 PDT (UTC-7).
const now = new Date('2026-09-26T17:00:00Z');
const at = (phrase: string, defaultHour = 9) => resolveWhen(phrase, { now, timeZone: TZ, defaultHour })?.iso ?? null;

test('a bare time is read in the org zone, today while it is still ahead', () => {
  assert.equal(at('3pm'), '2026-09-26T22:00:00.000Z');
  assert.equal(at('at 3:30 PM'), '2026-09-26T22:30:00.000Z');
  assert.equal(at('15:45'), '2026-09-26T22:45:00.000Z');
});

test('a bare time already past today rolls to tomorrow', () => {
  assert.equal(at('9am'), '2026-09-27T16:00:00.000Z');
});

test('day words and weekdays, with and without a time', () => {
  assert.equal(at('tomorrow 9am'), '2026-09-27T16:00:00.000Z');
  assert.equal(at('tomorrow', 17), '2026-09-28T00:00:00.000Z');
  assert.equal(at('Friday at 5pm'), '2026-10-03T00:00:00.000Z');
  assert.equal(at('next saturday noon'), '2026-10-03T19:00:00.000Z');
  assert.equal(at('today end of day'), '2026-09-27T00:00:00.000Z');
  assert.equal(at('Oct 3rd 8am'), '2026-10-03T15:00:00.000Z');
  assert.equal(at('10/1 2pm'), '2026-10-01T21:00:00.000Z');
});

test('the zone decides the instant across a DST change', () => {
  // Nov 2 2026 is after the PDT→PST switch (Nov 1): 9am PST = 17:00Z.
  assert.equal(at('2026-11-02 9am'), '2026-11-02T17:00:00.000Z');
});

test('relative offsets', () => {
  assert.equal(at('in 2 hours'), '2026-09-26T19:00:00.000Z');
  assert.equal(at('in an hour'), '2026-09-26T18:00:00.000Z');
});

test('anything unread resolves to null — ask, never guess', () => {
  assert.equal(at('sometime soon'), null);
  assert.equal(at('3pm-ish'), null);
  assert.equal(at('13pm'), null);
  assert.equal(at(''), null);
});
