/**
 * Pure preview / gallery-index helpers for timeline media strips.
 *
 *   npx tsx --test src/lib/timeline/timeline-media-strip.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTimelineGalleryIndex,
  timelineMediaStripPreview,
} from './timeline-media-strip';

test('timelineMediaStripPreview: at or under limit shows every thumb', () => {
  assert.deepEqual(timelineMediaStripPreview(0, 4), { visibleCount: 0, overflowCount: 0 });
  assert.deepEqual(timelineMediaStripPreview(3, 4), { visibleCount: 3, overflowCount: 0 });
  assert.deepEqual(timelineMediaStripPreview(4, 4), { visibleCount: 4, overflowCount: 0 });
});

test('timelineMediaStripPreview: 9 media / limit 4 → 3 thumbs + +6', () => {
  assert.deepEqual(timelineMediaStripPreview(9, 4), { visibleCount: 3, overflowCount: 6 });
});

test('resolveTimelineGalleryIndex: prefers photoId, then url, then fallback', () => {
  assert.equal(
    resolveTimelineGalleryIndex({
      photoId: 11,
      url: '/f/other',
      galleryPhotoIds: [10, 11, 12],
      galleryUrls: ['/a', '/b', '/c'],
      fallbackIndex: 0,
    }),
    1,
  );
  assert.equal(
    resolveTimelineGalleryIndex({
      photoId: 99,
      url: '/b',
      galleryPhotoIds: [10, 11, 12],
      galleryUrls: ['/a', '/b', '/c'],
      fallbackIndex: 0,
    }),
    1,
  );
  assert.equal(
    resolveTimelineGalleryIndex({
      photoId: 99,
      url: '/missing',
      galleryPhotoIds: [10, 11, 12],
      galleryUrls: ['/a', '/b', '/c'],
      fallbackIndex: 2,
    }),
    2,
  );
});
