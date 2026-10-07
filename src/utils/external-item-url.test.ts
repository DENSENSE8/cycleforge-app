/**
 * listingChipDisplay — host+path helper for non-table chrome.
 * Compound Item subtitle face is the fixed word "Listing", not this string.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildListingUrl,
  getExternalUrlByItemNumber,
  listingChipDisplay,
  listingMatchesOrderPlatform,
  listingStorefront,
  orderStorefront,
  resolveListingLink,
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

test('listingStorefront / orderStorefront: slugs, labels and account sources; the order number\'s shape wins', () => {
  assert.equal(listingStorefront('ebay purchasing'), 'ebay');
  assert.equal(listingStorefront('FBA'), 'amazon');
  assert.equal(listingStorefront('amazon_fba'), 'amazon');
  assert.equal(listingStorefront('Ecwid'), 'ecwid');
  assert.equal(listingStorefront('usav'), null);
  assert.equal(orderStorefront('19-15205-47811', 'ecwid'), 'ebay');
  assert.equal(orderStorefront('111-1234567-1234567', null), 'amazon');
  assert.equal(orderStorefront('5067', 'ecwid'), 'ecwid');
  assert.equal(orderStorefront('5067', null), null);
});

test('buildListingUrl: eBay /itm for a 12-digit item, Amazon /dp for an ASIN; Ecwid and wrong shapes build nothing', () => {
  assert.equal(buildListingUrl('ebay', '226611849000'), 'https://www.ebay.com/itm/226611849000');
  assert.equal(buildListingUrl('amazon', 'b0abcdef12'), 'https://www.amazon.com/dp/B0ABCDEF12');
  assert.equal(buildListingUrl('ebay', 'B0ABCDEF12'), null);
  assert.equal(buildListingUrl('amazon', '226611849000'), null);
  assert.equal(buildListingUrl('ecwid', '01241'), null);
  assert.equal(buildListingUrl('walmart', '123456789'), null);
  // Unknown storefront: the item number's own shape decides.
  assert.equal(buildListingUrl(null, '226611849000'), 'https://www.ebay.com/itm/226611849000');
  assert.equal(buildListingUrl(null, '01241'), null);
  assert.equal(buildListingUrl('ebay', '  '), null);
});

test('resolveListingLink precedence: exact item stored URL › stored URL on the storefront › built from the item # › built from a stored item id', () => {
  const stored = [
    { platform: 'ebay', itemId: '111111111111', url: 'https://www.ebay.com/itm/111111111111?var=1' },
    { platform: 'ebay', itemId: '226611849000', url: 'www.ebay.com/itm/226611849000' },
    { platform: 'ecwid', itemId: null, url: 'https://usavshop.com/01241-p1.html' },
  ];
  // 1. The row for this exact item number, even when another row comes first.
  assert.deepEqual(resolveListingLink({ storefront: 'ebay', itemNumber: '226611849000', stored }), {
    href: 'https://www.ebay.com/itm/226611849000',
    source: 'stored',
    storefront: 'ebay',
    missing: null,
  });
  // 2. No exact row: the first stored URL on the order's storefront — never another storefront's.
  assert.equal(resolveListingLink({ storefront: 'ebay', itemNumber: '999999999999', stored }).href, 'https://www.ebay.com/itm/111111111111?var=1');
  assert.equal(resolveListingLink({ storefront: 'ecwid', itemNumber: null, stored }).href, 'https://usavshop.com/01241-p1.html');
  // 3. Nothing stored on the storefront: built from the item number.
  assert.deepEqual(resolveListingLink({ storefront: 'ebay', itemNumber: '226611849000', stored: [stored[2]!] }), {
    href: 'https://www.ebay.com/itm/226611849000',
    source: 'built',
    storefront: 'ebay',
    missing: null,
  });
  // 4. No item number on the line (a suggested SKU): built from that SKU's stored item id on the storefront.
  assert.equal(
    resolveListingLink({ storefront: 'ebay', stored: [{ platform: 'ebay', itemId: '333333333333', url: null }, stored[2]!] }).href,
    'https://www.ebay.com/itm/333333333333',
  );
  // A stored URL of no known storefront answers only for its exact item number.
  const ownDomain = [{ platform: 'usav', itemId: 'ABC-1', url: 'https://usavshop.com/abc-1.html' }];
  assert.equal(resolveListingLink({ storefront: 'ebay', itemNumber: 'abc-1', stored: ownDomain }).href, 'https://usavshop.com/abc-1.html');
  assert.equal(resolveListingLink({ storefront: 'ebay', itemNumber: 'XYZ-2', stored: ownDomain }).href, null);
  // A stored value that is not an http(s) URL is ignored.
  assert.equal(resolveListingLink({ storefront: 'ecwid', stored: [{ platform: 'ecwid', itemId: null, url: 'ftp://usavshop.com/x' }] }).href, null);
});

test('resolveListingLink: no link says why (Ecwid has no pattern; no item number; a number that builds nothing)', () => {
  const ecwid = resolveListingLink({ storefront: 'ecwid', itemNumber: '01241' });
  assert.equal(ecwid.href, null);
  assert.match(ecwid.missing ?? '', /Ecwid has no listing-link pattern/);
  assert.match(resolveListingLink({ storefront: 'ebay', itemNumber: null }).missing ?? '', /No item number/);
  assert.match(resolveListingLink({ storefront: 'ebay', itemNumber: '12345' }).missing ?? '', /eBay item # 12345 does not build one/);
  assert.match(resolveListingLink({ storefront: null, itemNumber: '12345' }).missing ?? '', /no listing-link pattern/);
});
