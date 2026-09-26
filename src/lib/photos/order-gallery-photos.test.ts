/** node --import tsx --test src/lib/photos/order-gallery-photos.test.ts */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOrderGalleryPhotos } from './order-gallery-photos';
import type { UnitTimelinePhotoRow } from '@/lib/timeline';

function photo(overrides: Partial<UnitTimelinePhotoRow> = {}): UnitTimelinePhotoRow {
  return {
    photoId: 1,
    at: '2026-06-15T12:00:00.000Z',
    source: 'testing',
    thumbUrl: '/api/photos/1/content?variant=thumb',
    fullUrl: '/api/photos/1/content',
    ...overrides,
  } as UnitTimelinePhotoRow;
}

test('unit evidence carries its stage as the caption', () => {
  const out = buildOrderGalleryPhotos(
    [
      photo({ photoId: 1, source: 'arrival', fullUrl: '/a' }),
      photo({ photoId: 2, source: 'unbox_carton', fullUrl: '/b' }),
      photo({ photoId: 3, source: 'unbox_item', fullUrl: '/c' }),
      photo({ photoId: 4, source: 'testing', fullUrl: '/d' }),
      photo({ photoId: 5, source: 'packing', fullUrl: '/e' }),
    ],
    null,
  );
  assert.deepEqual(
    out.map((p) => (typeof p === 'string' ? null : p.meta?.caption)),
    ['Arrival · package', 'Unbox · carton', 'Unbox · item', 'Testing', 'Packing'],
  );
});

test('falls back to the thumb url when there is no full url', () => {
  const out = buildOrderGalleryPhotos(
    [photo({ fullUrl: '', thumbUrl: '/thumb-only' })],
    null,
  );
  assert.equal(out.length, 1);
  assert.equal(typeof out[0] === 'string' ? out[0] : out[0]?.url, '/thumb-only');
});

test('the legacy packer blob parses both shapes and skips anything else', () => {
  const out = buildOrderGalleryPhotos([], [
    '/legacy-string',
    { url: '/legacy-object' },
    { url: '' },
    { notUrl: '/ignored' },
    42,
    null,
  ]);
  assert.deepEqual(
    out.map((p) => (typeof p === 'string' ? p : p.url)),
    ['/legacy-string', '/legacy-object'],
  );
  assert.deepEqual(
    out.map((p) => (typeof p === 'string' ? null : p.meta?.caption)),
    ['Packing', 'Packing'],
  );
});

test('a url on BOTH spines appears once — unit evidence wins the caption', () => {
  const out = buildOrderGalleryPhotos(
    [photo({ source: 'packing', fullUrl: '/shared.jpg' })],
    ['/shared.jpg', '/only-legacy.jpg'],
  );
  assert.deepEqual(
    out.map((p) => (typeof p === 'string' ? p : p.url)),
    ['/shared.jpg', '/only-legacy.jpg'],
  );
});

test('duplicate unit rows collapse to one input', () => {
  const out = buildOrderGalleryPhotos(
    [
      photo({ photoId: 1, fullUrl: '/same.jpg' }),
      photo({ photoId: 2, fullUrl: '/same.jpg' }),
    ],
    null,
  );
  assert.equal(out.length, 1);
});

test('a non-array legacy blob is not a crash', () => {
  assert.deepEqual(buildOrderGalleryPhotos([], undefined), []);
  assert.deepEqual(buildOrderGalleryPhotos([], 'nope'), []);
  assert.deepEqual(buildOrderGalleryPhotos([], { url: '/x' }), []);
});
