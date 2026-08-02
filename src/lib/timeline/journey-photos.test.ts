import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeJourneyWithUnitPhotos, unitTimelinePhotosKey } from './journey-photos';
import type { TimelineItem } from './types';
import type { UnitTimelinePhotoRow } from './unit-photos-events';

function ev(id: string, at: string | null, title = `Event ${id}`): TimelineItem {
  return { id, at, title, tone: 'default' };
}

function photo(overrides: Partial<UnitTimelinePhotoRow> = {}): UnitTimelinePhotoRow {
  return {
    photoId: 1,
    at: '2026-06-15T12:00:00.000Z',
    source: 'testing',
    thumbUrl: '/t/1',
    fullUrl: '/f/1',
    ...overrides,
  };
}

test('inserts photo stage rows at their stage timestamps, newest-first', () => {
  const events = [
    ev('e-new', '2026-06-15T15:00:00.000Z'),
    ev('e-old', '2026-06-15T09:00:00.000Z'),
  ];
  const merged = mergeJourneyWithUnitPhotos(events, [
    photo({ photoId: 1, source: 'testing', at: '2026-06-15T12:00:00.000Z' }),
    photo({ photoId: 2, source: 'arrival', at: '2026-06-15T08:00:00.000Z' }),
  ]);

  assert.deepEqual(
    merged.map((i) => i.id),
    ['e-new', 'unit-photos-testing', 'e-old', 'unit-photos-arrival'],
  );
  const testing = merged.find((i) => i.id === 'unit-photos-testing');
  assert.equal(testing!.media?.length, 1);
});

test('empty or absent photos return the events array unchanged (same reference)', () => {
  const events = [ev('a', '2026-06-15T10:00:00.000Z')];
  assert.equal(mergeJourneyWithUnitPhotos(events, []), events);
  assert.equal(mergeJourneyWithUnitPhotos(events, null), events);
  assert.equal(mergeJourneyWithUnitPhotos(events, undefined), events);
});

test('skips photo rows whose id already exists in the journey (one mount owns media)', () => {
  const events = [
    ev('unit-photos-testing', '2026-06-15T12:00:00.000Z', 'Testing photos'),
    ev('e1', '2026-06-15T10:00:00.000Z'),
  ];
  const merged = mergeJourneyWithUnitPhotos(events, [photo({ source: 'testing' })]);
  assert.equal(merged, events); // nothing new to insert → untouched reference
  assert.equal(merged.filter((i) => i.id === 'unit-photos-testing').length, 1);
});

test('merging twice never duplicates stage rows', () => {
  const events = [ev('e1', '2026-06-15T10:00:00.000Z')];
  const once = mergeJourneyWithUnitPhotos(events, [photo()]);
  const twice = mergeJourneyWithUnitPhotos(once, [photo()]);
  assert.deepEqual(
    twice.map((i) => i.id),
    once.map((i) => i.id),
  );
});

test('mediaLimit caps thumbnails but keeps the true count in the subtitle', () => {
  const photos = [1, 2, 3, 4, 5, 6].map((n) =>
    photo({ photoId: n, at: `2026-06-15T0${n}:00:00.000Z`, thumbUrl: `/t/${n}`, fullUrl: `/f/${n}` }),
  );
  const [row] = mergeJourneyWithUnitPhotos([], photos, { mediaLimit: 4 });
  assert.equal(row!.media?.length, 4);
  assert.equal(row!.subtitle, '6 photos');
});

test('without mediaLimit, full stage media is preserved for the strip +N path', () => {
  const photos = [1, 2, 3, 4, 5, 6].map((n) =>
    photo({ photoId: n, at: `2026-06-15T0${n}:00:00.000Z`, thumbUrl: `/t/${n}`, fullUrl: `/f/${n}` }),
  );
  const [row] = mergeJourneyWithUnitPhotos([], photos);
  assert.equal(row!.media?.length, 6);
  assert.equal(row!.subtitle, '6 photos');
});

test('does not mutate its inputs', () => {
  const events = [ev('e1', '2026-06-15T10:00:00.000Z')];
  const snapshot = JSON.stringify(events);
  mergeJourneyWithUnitPhotos(events, [photo()]);
  assert.equal(JSON.stringify(events), snapshot);
});

test('photo rows with no timestamp sort last', () => {
  const merged = mergeJourneyWithUnitPhotos(
    [ev('e1', '2026-06-15T10:00:00.000Z')],
    [photo({ at: null })],
  );
  assert.deepEqual(
    merged.map((i) => i.id),
    ['e1', 'unit-photos-testing'],
  );
});

test('query key is the canonical unit-timeline-photos identity', () => {
  assert.deepEqual(unitTimelinePhotosKey(42), ['unit-timeline-photos', 42]);
});
