import assert from 'node:assert/strict';
import test from 'node:test';
import type { LibraryPhoto } from '@/lib/photos/photo-library-types';
import { groupPhotosByCaptureDay } from '@/lib/photos/capture-day-groups';

/** Minimal LibraryPhoto — only `id` + `createdAt` matter to the grouper. */
function photo(id: number, createdAt: string): LibraryPhoto {
  return { id, createdAt } as LibraryPhoto;
}

const ids = (groups: ReturnType<typeof groupPhotosByCaptureDay>) =>
  groups.map((g) => [g.dateKey, g.photos.map((p) => p.id)] as const);

test('buckets consecutive same-day captures into one band', () => {
  const groups = groupPhotosByCaptureDay([
    photo(1, '2026-07-20T18:00:00Z'),
    photo(2, '2026-07-20T19:00:00Z'),
    photo(3, '2026-07-19T18:00:00Z'),
  ]);
  assert.deepEqual(ids(groups), [
    ['2026-07-20', [1, 2]],
    ['2026-07-19', [3]],
  ]);
});

test('preserves array order — it does NOT sort', () => {
  // The server owns ordering (?sort=recent|oldest). If this function sorted, the
  // stream would be pinned newest-first and would silently contradict the sort
  // control. Oldest-first input must come back oldest-first.
  const groups = groupPhotosByCaptureDay([
    photo(1, '2026-07-18T18:00:00Z'),
    photo(2, '2026-07-19T18:00:00Z'),
    photo(3, '2026-07-20T18:00:00Z'),
  ]);
  assert.deepEqual(
    groups.map((g) => g.dateKey),
    ['2026-07-18', '2026-07-19', '2026-07-20'],
  );
});

test('a day revisited later in the stream becomes its own band, not a merge', () => {
  // Only a RUN merges. Teleporting a later row backwards into an earlier band
  // would reorder the stream out from under the active sort.
  const groups = groupPhotosByCaptureDay([
    photo(1, '2026-07-20T18:00:00Z'),
    photo(2, '2026-07-19T18:00:00Z'),
    photo(3, '2026-07-20T20:00:00Z'),
  ]);
  assert.deepEqual(ids(groups), [
    ['2026-07-20', [1]],
    ['2026-07-19', [2]],
    ['2026-07-20', [3]],
  ]);
});

test('buckets by warehouse civil day, not UTC', () => {
  // 2026-07-21T05:00Z is 2026-07-20 22:00 PDT — the same warehouse day as the
  // 18:00Z capture. A UTC or host-local bucket would split these into two days
  // and put an evening capture on tomorrow's band.
  const groups = groupPhotosByCaptureDay([
    photo(1, '2026-07-21T05:00:00Z'),
    photo(2, '2026-07-21T01:00:00Z'),
  ]);
  assert.deepEqual(ids(groups), [['2026-07-20', [1, 2]]]);
});

test('keeps a photo with an unparseable timestamp instead of dropping it', () => {
  // Evidence must never vanish from the library because of one bad timestamp.
  const groups = groupPhotosByCaptureDay([
    photo(1, '2026-07-20T18:00:00Z'),
    photo(2, 'not-a-date'),
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[1], { dateKey: '', photos: [groups[1].photos[0]] });
  assert.equal(groups[1].photos[0].id, 2);
  // Total photos in === total photos out.
  assert.equal(groups.reduce((n, g) => n + g.photos.length, 0), 2);
});

test('empty input yields no bands', () => {
  assert.deepEqual(groupPhotosByCaptureDay([]), []);
});
