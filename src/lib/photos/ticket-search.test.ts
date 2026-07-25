import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parsePhotoLibraryTicketSearch,
  photoLibrarySearchFace,
} from '@/lib/photos/ticket-search';

test('parsePhotoLibraryTicketSearch accepts digits and #prefix', () => {
  assert.equal(parsePhotoLibraryTicketSearch('9599'), '9599');
  assert.equal(parsePhotoLibraryTicketSearch('#9599'), '9599');
  assert.equal(parsePhotoLibraryTicketSearch('  #9599  '), '9599');
  assert.equal(parsePhotoLibraryTicketSearch('14-4421'), null);
  assert.equal(parsePhotoLibraryTicketSearch(''), null);
  assert.equal(parsePhotoLibraryTicketSearch(null), null);
});

test('photoLibrarySearchFace prefers finder, then claims ticket leaf', () => {
  assert.equal(
    photoLibrarySearchFace({ poFinder: '14-1', ticketId: '9599', sourceScope: 'claims' }),
    '14-1',
  );
  assert.equal(
    photoLibrarySearchFace({ ticketId: '#9599', sourceScope: 'claims' }),
    '9599',
  );
  assert.equal(photoLibrarySearchFace({ ticketId: '9599', sourceScope: 'unboxing' }), '');
  assert.equal(photoLibrarySearchFace({ q: 'damage' }), 'damage');
});
