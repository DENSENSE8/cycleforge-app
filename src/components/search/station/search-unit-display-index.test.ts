/**
 *   node --import tsx --test src/components/search/station/search-unit-display-index.test.ts
 *
 * Same contract as the order sibling: the Root Index and the leaf builder are
 * two lists that must name the same ids. `LEAF_IDS` mirrors
 * `SearchUnitStationPane`'s `buildSectionTabs` — add or gate a leaf there and
 * this is what fails.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchUnitDisplayIndexRows,
  type SearchUnitDisplaySignals,
} from './search-unit-display-index';

/** Every leaf `SearchUnitStationPane` can build, in its own order. */
const LEAF_IDS = ['photos', 'journey', 'order'] as const;

const SETTLED: SearchUnitDisplaySignals = {
  hasSerial: true,
  photoCount: 2,
  photosSettled: true,
  hasOrder: true,
};

test('every index row names a real leaf, and the order matches', () => {
  const ids = buildSearchUnitDisplayIndexRows(SETTLED).map((r) => r.id);
  assert.deepEqual(ids, [...LEAF_IDS]);
});

test('a photo query in flight reads Loading… and stays neutral — never a claimed zero', () => {
  const photos = buildSearchUnitDisplayIndexRows({
    ...SETTLED,
    photoCount: null,
    photosSettled: false,
  }).find((r) => r.id === 'photos');
  assert.equal(photos?.subtitle, 'Loading…');
  assert.equal(photos?.tone, 'neutral');
});

test('settled photos count, singular and plural; zero stays neutral', () => {
  const one = buildSearchUnitDisplayIndexRows({ ...SETTLED, photoCount: 1 });
  assert.equal(one.find((r) => r.id === 'photos')?.subtitle, '1 photo');
  assert.equal(buildSearchUnitDisplayIndexRows(SETTLED).find((r) => r.id === 'photos')?.subtitle, '2 photos');
  const none = buildSearchUnitDisplayIndexRows({ ...SETTLED, photoCount: 0 });
  assert.equal(none.find((r) => r.id === 'photos')?.subtitle, 'No photos');
  assert.equal(none.find((r) => r.id === 'photos')?.tone, 'neutral');
});

test('a minted-uid unit says it has no serial to trace, rather than opening an empty journey', () => {
  const journey = buildSearchUnitDisplayIndexRows({ ...SETTLED, hasSerial: false }).find(
    (r) => r.id === 'journey',
  );
  assert.equal(journey?.subtitle, 'No serial to trace');
  assert.equal(journey?.tone, 'neutral');
});

test('an unallocated unit says so — the row never vanishes, because absence is the answer', () => {
  const rows = buildSearchUnitDisplayIndexRows({ ...SETTLED, hasOrder: false });
  assert.deepEqual(rows.map((r) => r.id), [...LEAF_IDS]);
  assert.equal(rows.find((r) => r.id === 'order')?.subtitle, 'Not allocated');
});
