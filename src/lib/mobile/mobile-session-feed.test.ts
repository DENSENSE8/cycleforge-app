import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseMobileSessionEntries,
  pushMobileSessionEntry,
  type MobileSessionEntry,
} from './mobile-session-feed';

const entry = (over: Partial<MobileSessionEntry> = {}): MobileSessionEntry => ({
  id: 'one',
  job: 'unbox',
  title: 'Carton',
  identifier: 'TRACK-1',
  entityId: '42',
  state: 'done',
  href: '/m/scan',
  at: '2026-09-16T12:00:00.000Z',
  dedupeKey: 'unbox:42',
  ...over,
});

test('mobile session feed prepends and collapses the same job entity', () => {
  const next = pushMobileSessionEntry([entry()], entry({ id: 'two', at: '2026-09-16T12:01:00.000Z' }));
  assert.equal(next.length, 1);
  assert.equal(next[0]?.id, 'two');
});

test('mobile session feed rejects malformed persisted rows', () => {
  const parsed = parseMobileSessionEntries(JSON.stringify([entry(), { id: 'bad', href: 42 }]));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.id, 'one');
});
