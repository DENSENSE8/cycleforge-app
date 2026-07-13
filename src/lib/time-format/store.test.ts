/**
 * Time-format store: default, set, hydrate, subscribe. Isomorphic (no window in
 * node) — the store must default to 12h and stay in-memory-consistent.
 *   tsx --test src/lib/time-format/store.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getTimeFormat,
  isHour12,
  setTimeFormat,
  hydrateTimeFormat,
  subscribe,
} from './store';

test('defaults to 12h before any change', () => {
  assert.equal(getTimeFormat(), '12h');
  assert.equal(isHour12(), true);
});

test('setTimeFormat flips the value + notifies subscribers', () => {
  let notified = 0;
  const unsub = subscribe(() => { notified += 1; });

  setTimeFormat('24h');
  assert.equal(getTimeFormat(), '24h');
  assert.equal(isHour12(), false);
  assert.equal(notified, 1);

  // Same value → no-op, no extra notify.
  setTimeFormat('24h');
  assert.equal(notified, 1);

  setTimeFormat('12h');
  assert.equal(getTimeFormat(), '12h');
  assert.equal(notified, 2);
  unsub();
});

test('hydrateTimeFormat adopts a server value; null/garbage resets to default', () => {
  hydrateTimeFormat('24h');
  assert.equal(getTimeFormat(), '24h');

  hydrateTimeFormat(null);
  assert.equal(getTimeFormat(), '12h');

  hydrateTimeFormat('nonsense');
  assert.equal(getTimeFormat(), '12h');

  // reset for isolation
  setTimeFormat('12h');
});

test('invalid setTimeFormat value is ignored', () => {
  // @ts-expect-error — guarding runtime robustness against a bad value
  setTimeFormat('nope');
  assert.equal(getTimeFormat(), '12h');
});
