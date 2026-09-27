import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldSeedReadyToPackQueue } from './unshipped-seed-gate';

test('bare /pick seeds — the Picker desk Pending grid is the default mount', () => {
  assert.equal(shouldSeedReadyToPackQueue({}), true);
  assert.equal(shouldSeedReadyToPackQueue({ ship: 'pending' }), true);
});

test('Urgent keeps the seed — `attention` filters client-side, same query key', () => {
  assert.equal(shouldSeedReadyToPackQueue({ ship: 'urgent', attention: '1' }), true);
});

test('tabs that swap the table out do not seed', () => {
  assert.equal(shouldSeedReadyToPackQueue({ ship: 'all' }), false);
  assert.equal(shouldSeedReadyToPackQueue({ ship: 'history' }), false);
});

test('a facet that changes the query key does not seed', () => {
  assert.equal(shouldSeedReadyToPackQueue({ search: 'bose' }), false);
  assert.equal(shouldSeedReadyToPackQueue({ staff: '7' }), false);
  assert.equal(shouldSeedReadyToPackQueue({ stage: 'tested' }), false);
  // `stage=all` IS the default — it resolves to the seeded `stage: null` key.
  assert.equal(shouldSeedReadyToPackQueue({ stage: 'all' }), true);
});

test('array-valued params (repeated keys) read their first value', () => {
  assert.equal(shouldSeedReadyToPackQueue({ ship: ['history', 'pending'] }), false);
  assert.equal(shouldSeedReadyToPackQueue({ ship: ['pending'] }), true);
});
