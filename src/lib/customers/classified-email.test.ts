import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyEmail } from './classified-email';

test('classifies eBay member relay addresses without exposing the opaque local part', () => {
  assert.deepEqual(classifyEmail('012340d211796b4da19c@members.ebay.com'), {
    kind: 'marketplace-relay',
    provider: 'eBay',
    label: 'eBay relay email',
  });
});

test('classifies common marketplace and private relay domains', () => {
  assert.equal(classifyEmail('buyer@marketplace.amazon.com')?.label, 'Amazon relay email');
  assert.equal(classifyEmail('token@privaterelay.appleid.com')?.label, 'Private relay email');
});

test('leaves genuine customer email addresses unclassified', () => {
  assert.equal(classifyEmail('buyer@example.com'), null);
  assert.equal(classifyEmail(null), null);
});
