import assert from 'node:assert/strict';
import test from 'node:test';
import { orderSearchDisplayStatus } from './global-entity-search';

test('carrier-delivered order overrides an internal packed status in Command Search', () => {
  assert.equal(
    orderSearchDisplayStatus({ status: 'packed', carrier_delivered: true }),
    'delivered',
  );
});

test('non-delivered orders retain their internal workflow status', () => {
  assert.equal(
    orderSearchDisplayStatus({ status: 'packed', carrier_delivered: false }),
    'packed',
  );
});
