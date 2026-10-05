import test from 'node:test';
import assert from 'node:assert/strict';
import { primaryBucketId } from './bucket-precedence';

test('one painted status: the most specific bucket wins, own section first', () => {
  // The two combos the 213-number list carries (2026-10-04).
  assert.equal(primaryBucketId(['not_received', 'exceptions'], 'inbound'), 'exceptions');
  assert.equal(primaryBucketId(['awaiting_tracking', 'not_received'], 'inbound'), 'awaiting_tracking');
  assert.equal(primaryBucketId(['inbound:not_received', 'inbound:exceptions'], 'everywhere'), 'inbound:exceptions');
  assert.equal(primaryBucketId(['inbound:not_received', 'inbound:awaiting_tracking'], 'outbound'), 'inbound:awaiting_tracking');
  // Outbound: exceptions lead its own view order.
  assert.equal(primaryBucketId(['shipped', 'exceptions'], 'outbound'), 'exceptions');
  // The page's own section leads a found-elsewhere bucket.
  assert.equal(primaryBucketId(['inbound:exceptions', 'shipped'], 'outbound'), 'shipped');
  assert.equal(primaryBucketId([], 'inbound'), null);
});
