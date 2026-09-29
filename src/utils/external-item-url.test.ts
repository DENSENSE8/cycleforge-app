/**
 * listingChipDisplay — host+path helper for non-table chrome.
 * Compound Item subtitle face is the fixed word "Listing", not this string.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getExternalUrlByItemNumber,
  listingChipDisplay,
  listingMatchesOrderPlatform,
} from './external-item-url';

test('getExternalUrlByItemNumber maps ASIN / eBay / short ids', () => {
  assert.equal(getExternalUrlByItemNumber('B0ABCDEF12'), 'https://www.amazon.com/dp/B0ABCDEF12');
  assert.equal(getExternalUrlByItemNumber('123456789012'), 'https://www.ebay.com/itm/123456789012');
  assert.ok(getExternalUrlByItemNumber('SKU-1')?.includes('usavshop.com'));
});

test('listingMatchesOrderPlatform: a listing on another storefront than the order is a mismatch', () => {
  // The owner's case: eBay order, SKU 00014-P-5 → Ecwid store search, not eBay.
  assert.equal(listingMatchesOrderPlatform('00014-P-5', 'eBay'), false);
  assert.equal(listingMatchesOrderPlatform('123456789012', 'eBay'), true);
  assert.equal(listingMatchesOrderPlatform('B0ABCDEF12', 'FBA'), true);
  assert.equal(listingMatchesOrderPlatform('B0ABCDEF12', 'eBay'), false);
  assert.equal(listingMatchesOrderPlatform('00014-P-5', 'Ecwid'), true);
  // No storefront rule for the platform, or nothing to link: nothing to contradict.
  assert.equal(listingMatchesOrderPlatform('00014-P-5', 'Shopify'), true);
  assert.equal(listingMatchesOrderPlatform(null, 'eBay'), true);
});

test('listingChipDisplay strips scheme and www (diagnostic face, not compound chip)', () => {
  assert.equal(
    listingChipDisplay('https://www.amazon.com/dp/B0ABCDEF12'),
    'amazon.com/dp/B0ABCDEF12',
  );
  assert.equal(listingChipDisplay('https://www.ebay.com/itm/1'), 'ebay.com/itm/1');
});
