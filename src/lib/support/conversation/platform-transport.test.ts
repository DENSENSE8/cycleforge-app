import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supportTransportForPlatform } from './platform-transport';

test('an internal record speaks the internal transport whatever platform is passed', () => {
  assert.equal(supportTransportForPlatform('internal_record', null), 'internal');
  assert.equal(supportTransportForPlatform('internal_record', 'ebay'), 'internal');
});

test('eBay, Amazon and Ecwid platforms carry replies on their own marketplace transport', () => {
  assert.equal(supportTransportForPlatform('customer_conversation', 'ebay'), 'ebay');
  assert.equal(supportTransportForPlatform('customer_conversation', ' Amazon '), 'amazon');
  assert.equal(supportTransportForPlatform('customer_conversation', 'ecwid'), 'ecwid');
});

test('every other org platform is a pasted (manual) conversation', () => {
  assert.equal(supportTransportForPlatform('customer_conversation', 'fba'), 'manual');
  assert.equal(supportTransportForPlatform('customer_conversation', 'facebook_marketplace'), 'manual');
  assert.equal(supportTransportForPlatform('customer_conversation', null), 'manual');
});
