import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGcsObjectKey, buildGcsVideoObjectKey, displayObjectKey } from '../storage/path-builder';
import { slugifyImageType } from '../image-types';

test('buildGcsObjectKey nests receiving photos under org/receiving/YYYY/MM/PO-*', () => {
  const { objectKey, thumbObjectKey } = buildGcsObjectKey({
    organizationId: 'org-123',
    entityType: 'RECEIVING',
    photoId: 99,
    poRef: '4421',
    now: new Date('2026-06-18T12:00:00Z'),
  });
  assert.match(objectKey, /^org-123\/receiving\/2026\/06\/PO-4421\/99\.jpg$/);
  assert.match(thumbObjectKey, /99_thumb\.jpg$/);
});

test('buildGcsObjectKey uses serial-units path for SERIAL_UNIT', () => {
  const { objectKey } = buildGcsObjectKey({
    organizationId: 'org-123',
    entityType: 'SERIAL_UNIT',
    photoId: 7,
    unitUid: 'SKU-2510-000001',
  });
  assert.match(objectKey, /^org-123\/serial-units\/SKU-2510-000001\/7\.jpg$/);
});

test('a custom image-type prefix replaces the entity flow, keeping the PO segment', () => {
  const { objectKey, thumbObjectKey } = buildGcsObjectKey({
    organizationId: 'org-123',
    entityType: 'RECEIVING',
    photoId: 7,
    poRef: '12345',
    prefix: 'damage-closeups',
    now: new Date('2026-06-24T12:00:00Z'),
  });
  assert.equal(objectKey, 'org-123/damage-closeups/2026/06/PO-12345/7.jpg');
  assert.equal(thumbObjectKey, 'org-123/damage-closeups/2026/06/PO-12345/7_thumb.jpg');
});

test('a custom prefix drops the PO segment when there is no poRef', () => {
  const { objectKey } = buildGcsObjectKey({
    organizationId: 'org-123',
    entityType: 'SERIAL_UNIT',
    photoId: 5,
    poRef: null,
    prefix: 'qc',
    now: new Date('2026-06-24T12:00:00Z'),
  });
  assert.equal(objectKey, 'org-123/qc/2026/06/5.jpg');
});

test('a video files one videos/ level under the org, in the same flow directory as its photos', () => {
  const now = new Date('2026-09-24T12:00:00Z');
  const photo = buildGcsObjectKey({ organizationId: 'org-123', entityType: 'RECEIVING', photoId: 99, poRef: '4421', now });
  const video = buildGcsVideoObjectKey({
    organizationId: 'org-123',
    entityType: 'RECEIVING',
    entityId: 5,
    videoId: 42,
    extension: 'mov',
    poRef: '4421',
    now,
  });
  assert.equal(video, 'org-123/videos/receiving/2026/09/PO-4421/42.mov');
  assert.equal(photo.objectKey.replace(/^org-123\//, 'org-123/videos/').replace(/99\.jpg$/, '42.mov'), video);
});

test('an entity with no dedicated flow (repair) lands in the dated misc directory, keeping its extension', () => {
  const key = buildGcsVideoObjectKey({
    organizationId: 'org-9',
    entityType: 'REPAIR_SERVICE',
    entityId: 4799,
    videoId: 7,
    extension: 'webm',
    now: new Date('2026-01-03T00:00:00Z'),
  });
  assert.equal(key, 'org-9/videos/misc/2026/01/7.webm');
});

test('a video key partitions staff by the entity id and serial units by uid', () => {
  assert.equal(
    buildGcsVideoObjectKey({ organizationId: 'o', entityType: 'STAFF', entityId: 12, videoId: 3, extension: 'mp4' }),
    'o/videos/staff/12/avatar/3.mp4',
  );
  assert.equal(
    buildGcsVideoObjectKey({
      organizationId: 'o',
      entityType: 'SERIAL_UNIT',
      entityId: 8,
      videoId: 3,
      extension: 'mp4',
      unitUid: 'SKU-2510-000001',
    }),
    'o/videos/serial-units/SKU-2510-000001/3.mp4',
  );
});

test('slugifyImageType lowercases, hyphenates, trims, and falls back', () => {
  assert.equal(slugifyImageType('Damage Close-ups'), 'damage-close-ups');
  assert.equal(slugifyImageType('  QC / Defects!! '), 'qc-defects');
  assert.equal(slugifyImageType('***'), 'type');
});

test('displayObjectKey sits next to the original and is always .jpg', () => {
  assert.equal(
    displayObjectKey('org-123/receiving/2026/06/PO-4421/99.jpg'),
    'org-123/receiving/2026/06/PO-4421/99_display.jpg',
  );
  assert.equal(displayObjectKey('org-123/misc/2026/06/7.png'), 'org-123/misc/2026/06/7_display.jpg');
  // A dot in a directory segment is not an extension.
  assert.equal(displayObjectKey('org-123/PO-1.5/7'), 'org-123/PO-1.5/7_display.jpg');
});
