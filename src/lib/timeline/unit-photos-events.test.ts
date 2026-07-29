import test from 'node:test';
import assert from 'node:assert/strict';
import { unitPhotosToTimeline, type UnitTimelinePhotoRow } from './unit-photos-events';

function row(overrides: Partial<UnitTimelinePhotoRow> = {}): UnitTimelinePhotoRow {
  return {
    photoId: 1,
    at: '2026-06-15T12:00:00.000Z',
    source: 'testing',
    thumbUrl: '/api/photos/1/content?variant=thumb',
    fullUrl: '/api/photos/1/content',
    ...overrides,
  };
}

test('groups photos into one row per source with the right title + tone', () => {
  const items = unitPhotosToTimeline([
    row({ photoId: 1, source: 'testing' }),
    row({ photoId: 2, source: 'unbox_item' }),
    row({ photoId: 3, source: 'testing' }),
    row({ photoId: 4, source: 'packing' }),
  ]);

  assert.equal(items.length, 3);
  // Display order: evidence spine, inbound → outbound
  assert.equal(items[0]!.id, 'unit-photos-unbox_item');
  assert.equal(items[1]!.id, 'unit-photos-testing');
  assert.equal(items[2]!.id, 'unit-photos-packing');

  const testing = items.find((i) => i.id === 'unit-photos-testing');
  const unboxItem = items.find((i) => i.id === 'unit-photos-unbox_item');
  const packing = items.find((i) => i.id === 'unit-photos-packing');

  assert.ok(testing);
  assert.equal(testing!.title, 'Testing photos');
  assert.equal(testing!.tone, 'info');
  assert.equal(testing!.subtitle, '2 photos');
  assert.equal(testing!.media?.length, 2);

  assert.ok(unboxItem);
  assert.equal(unboxItem!.title, 'Unbox · item photos');
  assert.equal(unboxItem!.tone, 'muted');
  assert.equal(unboxItem!.subtitle, '1 photo');

  assert.ok(packing);
  assert.equal(packing!.title, 'Packing photos');
  assert.equal(packing!.tone, 'success');
  assert.equal(packing!.subtitle, '1 photo');
});

test('orders all five stages along the evidence spine', () => {
  const items = unitPhotosToTimeline([
    row({ photoId: 1, source: 'packing' }),
    row({ photoId: 2, source: 'testing' }),
    row({ photoId: 3, source: 'unbox_item' }),
    row({ photoId: 4, source: 'unbox_carton' }),
    row({ photoId: 5, source: 'arrival' }),
  ]);

  assert.deepEqual(
    items.map((i) => i.id),
    [
      'unit-photos-arrival',
      'unit-photos-unbox_carton',
      'unit-photos-unbox_item',
      'unit-photos-testing',
      'unit-photos-packing',
    ],
  );
  // Titles compose the stage-label SoT (photoStageLabel), not a local map.
  assert.deepEqual(
    items.map((i) => i.title),
    [
      'Arrival · package photos',
      'Unbox · carton photos',
      'Unbox · item photos',
      'Testing photos',
      'Packing photos',
    ],
  );
});

test('attaches each photo as media (photoId + thumb + full + stage caption)', () => {
  const [item] = unitPhotosToTimeline([
    row({ photoId: 42, thumbUrl: '/t/42', fullUrl: '/f/42' }),
  ]);
  assert.deepEqual(item.media, [
    { photoId: 42, thumbUrl: '/t/42', fullUrl: '/f/42', caption: 'Testing' },
  ]);
});

test('row timestamp is the newest capture in the source group', () => {
  const [item] = unitPhotosToTimeline([
    row({ photoId: 1, at: '2026-06-15T10:00:00.000Z' }),
    row({ photoId: 2, at: '2026-06-15T14:00:00.000Z' }),
    row({ photoId: 3, at: '2026-06-15T09:00:00.000Z' }),
  ]);
  assert.equal(item.at, '2026-06-15T14:00:00.000Z');
});

test('empty input yields no rows', () => {
  assert.deepEqual(unitPhotosToTimeline([]), []);
});
