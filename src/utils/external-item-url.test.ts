/**
 * listingChipDisplay — host+path helper for non-table chrome.
 * Compound Item subtitle face is the fixed word "Listing", not this string.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getExternalUrlByItemNumber,
  listingChipDisplay,
} from './external-item-url';

test('getExternalUrlByItemNumber maps ASIN / eBay / short ids', () => {
  assert.equal(getExternalUrlByItemNumber('B0ABCDEF12'), 'https://www.amazon.com/dp/B0ABCDEF12');
  assert.equal(getExternalUrlByItemNumber('123456789012'), 'https://www.ebay.com/itm/123456789012');
  assert.ok(getExternalUrlByItemNumber('SKU-1')?.includes('usavshop.com'));
});

test('listingChipDisplay strips scheme and www (diagnostic face, not compound chip)', () => {
  assert.equal(
    listingChipDisplay('https://www.amazon.com/dp/B0ABCDEF12'),
    'amazon.com/dp/B0ABCDEF12',
  );
  assert.equal(listingChipDisplay('https://www.ebay.com/itm/1'), 'ebay.com/itm/1');
});
