import test from 'node:test';
import assert from 'node:assert/strict';
import type { LibraryPhoto } from '@/components/photos/photo-library-types';
import { filterPhotosByQuery, photoMatchesQuery } from '@/lib/photos/photo-find';

function photo(overrides: Partial<LibraryPhoto> = {}): LibraryPhoto {
  return {
    id: 4412,
    photoType: 'UNBOX_ITEM',
    poRef: '14-4421',
    tracking: '9400111899560000000000',
    sku: 'BOSE-901-IV',
    serialNumber: 'SN-77123',
    createdAt: '2026-09-01T18:22:00.000Z',
    displayUrl: '/api/photos/4412/content',
    thumbUrl: '/api/photos/4412/content?variant=thumb',
    ...overrides,
  };
}

test('an empty or blank query keeps every loaded row', () => {
  const rows = [photo(), photo({ id: 9, poRef: null, sku: null, serialNumber: null })];

  assert.equal(filterPhotosByQuery(rows, '').length, 2);
  assert.equal(filterPhotosByQuery(rows, '   ').length, 2);
  assert.equal(photoMatchesQuery(rows[1], ''), true);
});

test('unscoped find matches painted facts case- and padding-insensitively', () => {
  const row = photo();

  assert.equal(photoMatchesQuery(row, 'bose-901'), true);
  assert.equal(photoMatchesQuery(row, '  SN-77123 '), true);
  // The file name the list row prints is `PO-14-4421_BOSE-901-IV_SN-SN-77123…`.
  assert.equal(photoMatchesQuery(row, 'po-14-4421'), true);
  assert.equal(photoMatchesQuery(row, 'marantz'), false);
});

test('a pinned field scope refuses facts outside that field', () => {
  const row = photo();

  assert.equal(photoMatchesQuery(row, 'BOSE-901-IV', { field: 'sku' }), true);
  assert.equal(photoMatchesQuery(row, 'BOSE-901-IV', { field: 'tracking' }), false);
  assert.equal(photoMatchesQuery(row, '94001118995', { field: 'tracking' }), true);
  assert.equal(photoMatchesQuery(row, 'SN-77123', { field: 'serial' }), true);
  assert.equal(photoMatchesQuery(row, 'SN-77123', { field: 'po' }), false);
});

test('PO scope accepts the typed `PO 14-…` form, not just the bare ref', () => {
  const row = photo();

  assert.equal(photoMatchesQuery(row, '14-4421', { field: 'po' }), true);
  assert.equal(photoMatchesQuery(row, 'PO 14-4421', { field: 'po' }), true);
  // One reference fact: packing rows read it as an order, unboxing as a PO.
  assert.equal(photoMatchesQuery(row, '14-4421', { field: 'order' }), true);
});

test('ticket scope matches with and without the # the chip paints', () => {
  const row = photo({ ticketId: 9599, poRef: null });

  assert.equal(photoMatchesQuery(row, '9599', { field: 'ticket' }), true);
  assert.equal(photoMatchesQuery(row, '#9599', { field: 'ticket' }), true);
  assert.equal(photoMatchesQuery(row, '9598', { field: 'ticket' }), false);
});

test('serial scope also covers the minted unit uid', () => {
  const row = photo({ serialNumber: null, unitUid: 'USAV-000813' });

  assert.equal(photoMatchesQuery(row, 'usav-000813', { field: 'serial' }), true);
});

test('unscoped find reaches labels, caption, uploader and original filename', () => {
  const row = photo({
    caption: 'dented corner, packaging retained',
    filename: 'IMG_8841.HEIC',
    takenByStaffName: 'Marisol Vega',
    labels: [{ id: 3, key: 'damage_claim', label: 'Damage claim', color: 'rose' }],
  });

  assert.equal(photoMatchesQuery(row, 'dented corner'), true);
  assert.equal(photoMatchesQuery(row, 'img_8841'), true);
  assert.equal(photoMatchesQuery(row, 'marisol'), true);
  assert.equal(photoMatchesQuery(row, 'damage claim'), true);
});

test('a row with no identity still matches on its type and id', () => {
  const row = photo({ poRef: null, sku: null, serialNumber: null, tracking: null, id: 77 });

  assert.equal(photoMatchesQuery(row, 'unbox item'), true);
  assert.equal(photoMatchesQuery(row, '77'), true);
});

test('claims scope paints the ticket, so the ticket is findable unscoped', () => {
  const row = photo({ ticketId: 9599, sourceScope: 'claims' });

  assert.equal(photoMatchesQuery(row, '9599', { scope: 'claims' }), true);
});
