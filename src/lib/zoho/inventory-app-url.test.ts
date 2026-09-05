import test from 'node:test';
import assert from 'node:assert/strict';

import { zohoInventoryItemAppUrl } from './inventory-app-url';

test('zohoInventoryItemAppUrl encodes the item id on the inventory items hash route', () => {
  assert.equal(
    zohoInventoryItemAppUrl('123456000000123'),
    'https://inventory.zoho.com/app#/inventory/items/123456000000123',
  );
  assert.equal(
    zohoInventoryItemAppUrl('a/b'),
    'https://inventory.zoho.com/app#/inventory/items/a%2Fb',
  );
});

test('zohoInventoryItemAppUrl refuses blank ids', () => {
  assert.equal(zohoInventoryItemAppUrl(null), null);
  assert.equal(zohoInventoryItemAppUrl(''), null);
  assert.equal(zohoInventoryItemAppUrl('   '), null);
});
