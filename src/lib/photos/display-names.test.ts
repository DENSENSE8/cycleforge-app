import assert from 'node:assert/strict';
import test from 'node:test';
import {
  claimsTicketLabel,
  PHOTO_STAGE_FILE_SLUGS,
  photoExportBaseName,
  photoFileName,
  photoGroupHeaderLabel,
  photoGroupKey,
  photoIdentityLine,
  photoPrimaryLabel,
  photoRefLabel,
  photoShareTitle,
  UNLINKED_PHOTO_GROUP_KEY,
} from '@/lib/photos/display-names';
import { PHOTO_EVIDENCE_STAGES } from '@/lib/photos/stages';

const claimPhoto = { id: 99, poRef: '14-4421', ticketId: 4821, photoType: 'receiving' };

test('claims scope groups and labels by Zendesk ticket id as #4821', () => {
  assert.equal(photoGroupKey(claimPhoto, 'claims'), 'ticket:4821');
  assert.equal(photoPrimaryLabel(claimPhoto, 'claims'), '#4821');
  assert.equal(photoFileName(claimPhoto, 'claims'), '4821-99.jpg');
  assert.equal(photoGroupHeaderLabel('ticket:4821', 'claims'), '#4821');
  assert.equal(claimsTicketLabel(4821), '#4821');
});

test('unboxing scope keeps PO-based naming even when a ticket link exists', () => {
  assert.equal(photoGroupKey(claimPhoto, 'unboxing'), 'po:14-4421');
  assert.equal(photoPrimaryLabel(claimPhoto, 'unboxing'), 'PO 14-4421');
  assert.equal(photoFileName(claimPhoto, 'unboxing'), 'PO-14-4421-99.jpg');
});

test('claims photos without a ticket link fall into Unlinked', () => {
  const orphan = { id: 1, poRef: 'PO-1', ticketId: null, photoType: null };
  assert.equal(photoGroupKey(orphan, 'claims'), UNLINKED_PHOTO_GROUP_KEY);
  assert.equal(photoGroupHeaderLabel(UNLINKED_PHOTO_GROUP_KEY, 'claims'), 'Unlinked');
});

test('group header labels wear the last-8 face of long identifiers', () => {
  assert.equal(photoGroupHeaderLabel('po:10084000397923', 'unboxing'), 'PO 00397923');
  assert.equal(photoGroupHeaderLabel('po:14-4421', 'packing'), 'Order 14-4421');
});

test('photoExportBaseName prefers ticket id for linked claim photos', () => {
  assert.equal(photoExportBaseName(claimPhoto), '4821');
  assert.equal(photoExportBaseName({ id: 1, poRef: '4421', ticketId: null }), 'PO-4421');
});

test('photoShareTitle uses #ticket in claims scope', () => {
  assert.equal(photoShareTitle([claimPhoto], 'claims'), '#4821 photos (1)');
  assert.equal(photoShareTitle([claimPhoto], 'unboxing'), 'PO 14-4421 photos (1)');
});

// ── PO · SKU · serial identity + stage (WS-PHOTO Plan 3) ────────────────────

const identityPhoto = {
  id: 7,
  poRef: '14-4421',
  ticketId: null,
  photoType: 'receiving_item',
  sku: 'WM-1023',
  serialNumber: 'SN0042',
  stage: 'unbox_item' as const,
};

test('photoIdentityLine joins SKU · serial and hides when neither is known', () => {
  assert.equal(photoIdentityLine(identityPhoto), 'WM-1023 · SN0042');
  assert.equal(photoIdentityLine({ ...identityPhoto, serialNumber: null }), 'WM-1023');
  assert.equal(photoIdentityLine({ ...identityPhoto, sku: null }), 'SN0042');
  assert.equal(photoIdentityLine({ id: 1, poRef: '4421' }), null);
  assert.equal(photoIdentityLine({ id: 1, sku: '  ', serialNumber: '' }), null);
});

test('photoPrimaryLabel preference: ticket → PO · SKU · serial → PO → type → id', () => {
  // Ticket always wins in claims scope.
  assert.equal(photoPrimaryLabel({ ...identityPhoto, ticketId: 4821 }, 'claims'), '#4821');
  // PO + identity combine.
  assert.equal(photoPrimaryLabel(identityPhoto, 'unboxing'), 'PO 14-4421 · WM-1023 · SN0042');
  // Identity without a PO still names the photo.
  assert.equal(photoPrimaryLabel({ ...identityPhoto, poRef: null }, 'unboxing'), 'WM-1023 · SN0042');
  // No identity → the historical PO-only label (regression pin).
  assert.equal(photoPrimaryLabel(claimPhoto, 'unboxing'), 'PO 14-4421');
  // Type → id fallbacks unchanged.
  assert.equal(photoPrimaryLabel({ id: 3, photoType: 'testing_photo' }, 'repair'), 'testing photo');
  assert.equal(photoPrimaryLabel({ id: 3 }, 'repair'), 'Photo 3');
});

test('photoRefLabel stays the short ticket/PO title (tile title row)', () => {
  assert.equal(photoRefLabel(identityPhoto, 'unboxing'), 'PO 14-4421');
  assert.equal(photoRefLabel({ ...identityPhoto, ticketId: 4821 }, 'claims'), '#4821');
});

test('file names append SKU, SN-serial, and the path-safe stage slug', () => {
  assert.equal(
    photoFileName(identityPhoto, 'unboxing'),
    'PO-14-4421_WM-1023_SN-SN0042_unbox-item-7.jpg',
  );
  // Unsafe identifier characters collapse to hyphens (path/URL-safe names).
  assert.equal(
    photoFileName({ ...identityPhoto, sku: 'WM 10/23', serialNumber: null, stage: null }, 'unboxing'),
    'PO-14-4421_WM-10-23-7.jpg',
  );
  // No identity → historical shape (regression pin).
  assert.equal(photoFileName(claimPhoto, 'unboxing'), 'PO-14-4421-99.jpg');
  assert.equal(photoFileName(claimPhoto, 'claims'), '4821-99.jpg');
});

test('photoExportBaseName appends identity + stage parts when known', () => {
  assert.equal(photoExportBaseName(identityPhoto), 'PO-14-4421_WM-1023_SN-SN0042_unbox-item');
  assert.equal(photoExportBaseName(claimPhoto), '4821');
  assert.equal(photoExportBaseName({ id: 1, poRef: '4421', ticketId: null }), 'PO-4421');
});

test('every evidence stage has a lowercase path-safe file slug', () => {
  for (const stage of PHOTO_EVIDENCE_STAGES) {
    const slug = PHOTO_STAGE_FILE_SLUGS[stage];
    assert.ok(slug, `missing slug for ${stage}`);
    assert.match(slug, /^[a-z0-9-]+$/);
  }
});
