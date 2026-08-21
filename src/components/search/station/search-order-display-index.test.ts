/**
 *   node --import tsx --test src/components/search/station/search-order-display-index.test.ts
 *
 * The Root Index and the leaf builder are two lists that must name the same
 * ids: a row here whose id is not a `buildSectionTabs` id in
 * `SearchOrderStationPane` navigates nowhere, and a leaf with no row is
 * unreachable from the index. `LEAF_IDS` below mirrors that file — when you add
 * or gate a leaf there, this test is what fails.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchOrderDisplayIndexRows,
  type SearchOrderDisplaySignals,
} from './search-order-display-index';

/** Every leaf `SearchOrderStationPane` can build, in its own order. */
const LEAF_IDS = [
  'photos',
  'status',
  'timeline',
  'units',
  'ticket',
  'support',
  'warranty',
] as const;

const SETTLED: SearchOrderDisplaySignals = {
  hasOrderNumber: true,
  photoCount: 3,
  photosSettled: true,
  hasWarrantyOrReturns: true,
  serialCount: 2,
};

test('every index row names a real leaf, and the order matches', () => {
  const ids = buildSearchOrderDisplayIndexRows(SETTLED).map((r) => r.id);
  assert.deepEqual(ids, [...LEAF_IDS]);
});

test('no serials → no Units row, because the leaf is not built either', () => {
  const ids = buildSearchOrderDisplayIndexRows({ ...SETTLED, serialCount: 0 }).map((r) => r.id);
  assert.deepEqual(
    ids,
    LEAF_IDS.filter((id) => id !== 'units'),
  );
  // Still a subset of the leaves — a gated row may vanish, never rename.
  assert.equal(
    ids.every((id) => (LEAF_IDS as readonly string[]).includes(id)),
    true,
  );
});

test('a photo query in flight reads Loading… and stays neutral — it never claims zero', () => {
  const rows = buildSearchOrderDisplayIndexRows({
    ...SETTLED,
    photoCount: null,
    photosSettled: false,
  });
  const photos = rows.find((r) => r.id === 'photos');
  assert.equal(photos?.subtitle, 'Loading…');
  assert.equal(photos?.tone, 'neutral');
});

test('settled with zero photos is the honest "No photos", still neutral', () => {
  const rows = buildSearchOrderDisplayIndexRows({ ...SETTLED, photoCount: 0 });
  const photos = rows.find((r) => r.id === 'photos');
  assert.equal(photos?.subtitle, 'No photos');
  // Evidence presence is informational on a read surface — never `action`.
  assert.equal(photos?.tone, 'neutral');
});

test('settled with photos is ok-toned and counts them, singular and plural', () => {
  assert.equal(
    buildSearchOrderDisplayIndexRows({ ...SETTLED, photoCount: 1 }).find((r) => r.id === 'photos')
      ?.subtitle,
    '1 photo',
  );
  const many = buildSearchOrderDisplayIndexRows(SETTLED).find((r) => r.id === 'photos');
  assert.equal(many?.subtitle, '3 photos');
  assert.equal(many?.tone, 'ok');
});

test('the Units subtitle counts serials, singular and plural', () => {
  assert.equal(
    buildSearchOrderDisplayIndexRows({ ...SETTLED, serialCount: 1 }).find((r) => r.id === 'units')
      ?.subtitle,
    '1 serial',
  );
  assert.equal(
    buildSearchOrderDisplayIndexRows(SETTLED).find((r) => r.id === 'units')?.subtitle,
    '2 serials',
  );
});

test('no order # leaves the Ticket row honest about having nothing to anchor', () => {
  const rows = buildSearchOrderDisplayIndexRows({ ...SETTLED, hasOrderNumber: false });
  const ticket = rows.find((r) => r.id === 'ticket');
  assert.equal(ticket?.subtitle, 'No order # to anchor');
  assert.equal(ticket?.tone, 'neutral');
});
