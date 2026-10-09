import test from 'node:test';
import assert from 'node:assert/strict';
import { liveFeedFilterParams, liveFeedSortParam, readLiveFeedFilters } from './route';
import { resolvePackageSorts } from './stages';
import { normalizePackageTag, PACKAGE_TAG_MAX } from './tags';

test('filters read the SQL keys: carriers upper-cased, channels lower-cased, deduped; a bad staff id is no filter', () => {
  const filters = readLiveFeedFilters(new URLSearchParams('carrier= usps,UPS,usps,&channel=Amazon,ebay&staff=abc&docs=Label,nope,slip&flag=damaged,Bad Id'));
  assert.deepEqual(filters, {
    carriers: ['USPS', 'UPS'],
    channels: ['amazon', 'ebay'],
    docs: ['label', 'slip'],
    flags: ['damaged'],
    staffId: null,
    sorts: null,
  });
  assert.deepEqual(readLiveFeedFilters(new URLSearchParams('carrier=&staff=12')), { carriers: null, channels: null, docs: null, flags: null, staffId: 12, sorts: null });
  // Round trip: the API query the client sends reads back the same filters.
  assert.deepEqual(readLiveFeedFilters(liveFeedFilterParams(filters)), filters);
});

test('column sorts: only valid non-default choices are kept, written in pipeline order, and round-trip', () => {
  // Scanned out has no `urgent`; a default (`to_pick:urgent`) and junk are dropped.
  const filters = readLiveFeedFilters(new URLSearchParams('sort=packed:latest,scanned_out:urgent,to_pick:urgent,bogus:latest,picked:oldest,scanned_out:oldest'));
  assert.deepEqual(filters.sorts, { packed: 'latest', picked: 'oldest', scanned_out: 'oldest' });
  assert.equal(liveFeedSortParam(filters.sorts), 'picked:oldest,packed:latest,scanned_out:oldest');
  assert.deepEqual(readLiveFeedFilters(liveFeedFilterParams(filters)), filters);
  // Every column resolves: chosen where valid, else its default.
  assert.deepEqual(resolvePackageSorts(filters.sorts), { to_pick: 'urgent', picked: 'oldest', packed: 'latest', scanned_out: 'oldest' });
  // Choosing a column's default clears the param.
  assert.equal(liveFeedSortParam({ to_pick: 'urgent', scanned_out: 'latest' }), null);
});

test('a typed tag takes the preset casing, collapses spaces, and is refused when empty or too long', () => {
  assert.equal(normalizePackageTag('  damaged '), 'Damaged');
  assert.equal(normalizePackageTag('missing   PART'), 'Missing part');
  assert.equal(normalizePackageTag('Fragile  glass'), 'Fragile glass');
  assert.equal(normalizePackageTag('   '), null);
  assert.equal(normalizePackageTag('x'.repeat(PACKAGE_TAG_MAX + 1)), null);
  assert.equal(normalizePackageTag('x'.repeat(PACKAGE_TAG_MAX)), 'x'.repeat(PACKAGE_TAG_MAX));
});
