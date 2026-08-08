/**
 *   node --import tsx --test src/components/packer/pack-display-index.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPackDisplayIndexRows } from './pack-display-index';

test('buildPackDisplayIndexRows is Photos · Timeline · Listings (no Ticket · Support)', () => {
  const rows = buildPackDisplayIndexRows({
    photosVisible: true,
    hasTimeline: true,
    packedCount: 1,
    totalCount: 2,
    hasListing: true,
  });
  assert.deepEqual(
    rows.map((r) => r.id),
    ['photos', 'timeline', 'listings'],
  );
  assert.equal(rows.find((r) => r.id === 'timeline')?.subtitle, '1/2 packed');
  assert.equal(rows.find((r) => r.id === 'listings')?.group, 'context');
  assert.equal(rows.find((r) => r.id === 'listings')?.subtitle, 'Listing links');
});

test('buildPackDisplayIndexRows omits gated photos/timeline; Listings always trailing', () => {
  const rows = buildPackDisplayIndexRows({
    photosVisible: false,
    hasTimeline: false,
    packedCount: 0,
    totalCount: 0,
    hasListing: false,
  });
  assert.deepEqual(
    rows.map((r) => r.id),
    ['listings'],
  );
  assert.equal(rows[0]?.subtitle, 'No listing');
  assert.equal(rows.some((r) => r.id === 'ticket' || r.id === 'support'), false);
});
