import test from 'node:test';
import assert from 'node:assert/strict';
import { liveFeedFilterParams, readLiveFeedFilters } from './route';
import { normalizePackageTag, PACKAGE_TAG_MAX } from './tags';

test('filters read the SQL keys: carriers upper-cased, channels lower-cased, deduped; a bad staff id is no filter', () => {
  const filters = readLiveFeedFilters(new URLSearchParams('carrier= usps,UPS,usps,&channel=Amazon,ebay&staff=abc'));
  assert.deepEqual(filters, { carriers: ['USPS', 'UPS'], channels: ['amazon', 'ebay'], staffId: null });
  assert.deepEqual(readLiveFeedFilters(new URLSearchParams('carrier=&staff=12')), { carriers: null, channels: null, staffId: 12 });
  // Round trip: the API query the client sends reads back the same filters.
  assert.deepEqual(readLiveFeedFilters(liveFeedFilterParams(filters)), filters);
});

test('a typed tag takes the preset casing, collapses spaces, and is refused when empty or too long', () => {
  assert.equal(normalizePackageTag('  damaged '), 'Damaged');
  assert.equal(normalizePackageTag('missing   PART'), 'Missing part');
  assert.equal(normalizePackageTag('Fragile  glass'), 'Fragile glass');
  assert.equal(normalizePackageTag('   '), null);
  assert.equal(normalizePackageTag('x'.repeat(PACKAGE_TAG_MAX + 1)), null);
  assert.equal(normalizePackageTag('x'.repeat(PACKAGE_TAG_MAX)), 'x'.repeat(PACKAGE_TAG_MAX));
});
