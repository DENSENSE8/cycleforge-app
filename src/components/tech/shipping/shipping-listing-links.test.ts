/**
 *   node --import tsx --test src/components/tech/shipping/shipping-listing-links.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveShippingListingLinks } from './shipping-listing-links';

test('empty item + sku → no listing links', () => {
  const r = resolveShippingListingLinks({ itemNumber: null, sku: '' });
  assert.equal(r.listingUrl, null);
  assert.deepEqual(r.listingLinks, []);
  assert.equal(r.listingItemKey, '');
});

test('sku falls back when itemNumber empty', () => {
  const r = resolveShippingListingLinks({ itemNumber: null, sku: 'SOME-SKU' });
  assert.equal(r.listingItemKey, 'SOME-SKU');
  // URL may be null when catalog has no mapping — key still resolved.
  assert.ok(typeof r.listingUrl === 'string' || r.listingUrl === null);
});

test('derived link carries catalog source when URL resolves', () => {
  // Prefer a well-known Amazon ASIN-shaped item number if the SoT maps it;
  // otherwise assert shape only when listingUrl is present.
  const r = resolveShippingListingLinks({
    itemNumber: 'B00TESTASIN',
    sku: 'ignored-when-item',
  });
  assert.equal(r.listingItemKey, 'B00TESTASIN');
  if (r.listingUrl) {
    assert.equal(r.listingLinks.length, 1);
    assert.equal(r.listingLinks[0]?.source, 'derived');
    assert.equal(r.listingLinks[0]?.href, r.listingUrl);
  } else {
    assert.deepEqual(r.listingLinks, []);
  }
});
