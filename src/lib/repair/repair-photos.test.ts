import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { repairMediaTimeline, repairPhotoKind, type RepairPhoto, type RepairVideo } from './repair-photos';

const photo = (id: number, createdAt: string): RepairPhoto => ({
  id,
  url: `/p/${id}`,
  thumbUrl: `/p/${id}?t`,
  photoType: null,
  createdAt,
});
const video = (id: number, createdAt: string): RepairVideo => ({
  id,
  url: `/v/${id}`,
  contentType: 'video/mp4',
  sizeBytes: 1,
  createdAt,
});

describe('repairMediaTimeline', () => {
  it('interleaves photos and videos oldest first by their server stamp', () => {
    const items = repairMediaTimeline(
      [photo(1, '2026-09-24T10:00:00Z'), photo(2, '2026-09-24T12:00:00Z')],
      [video(9, '2026-09-24T11:00:00Z')],
    );
    assert.deepEqual(
      items.map((i) => (i.kind === 'photo' ? `p${i.photo.id}` : `v${i.video.id}`)),
      ['p1', 'v9', 'p2'],
    );
  });

  it('keeps a photo before a video stamped at the same instant', () => {
    const at = '2026-09-24T10:00:00Z';
    const items = repairMediaTimeline([photo(1, at)], [video(9, at)]);
    assert.deepEqual(items.map((i) => i.kind), ['photo', 'video']);
  });
});

describe('repairPhotoKind', () => {
  it('files the shipping stamp and the bench after-shot under shipping', () => {
    assert.equal(repairPhotoKind('repair_shipping'), 'shipping');
    assert.equal(repairPhotoKind(' Repair_Shipping '), 'shipping');
    assert.equal(repairPhotoKind('bench_after'), 'shipping');
  });

  it('files the receiving stamp, the bench before-shot, untyped and unknown rows under receiving', () => {
    for (const t of ['repair_receiving', 'bench_before', null, undefined, '', 'packer_photo']) {
      assert.equal(repairPhotoKind(t), 'receiving', String(t));
    }
  });
});
