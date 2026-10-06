import assert from 'node:assert/strict';
import test from 'node:test';
import { orderSearchDisplayStatus } from './global-entity-search';

test('Command Search paints the allocate label the query already resolved', () => {
  assert.equal(orderSearchDisplayStatus({ allocate_status: 'To pick' }), 'To pick');
  assert.equal(orderSearchDisplayStatus({ allocate_status: 'Fulfilled' }), 'Fulfilled');
});

test('a missing allocate label falls back to To pick, never a channel status', () => {
  assert.equal(orderSearchDisplayStatus({}), 'To pick');
});
