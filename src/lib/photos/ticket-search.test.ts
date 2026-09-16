import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePhotoLibraryTicketSearch } from '@/lib/photos/ticket-search';

test('parsePhotoLibraryTicketSearch accepts digits and #prefix', () => {
  assert.equal(parsePhotoLibraryTicketSearch('9599'), '9599');
  assert.equal(parsePhotoLibraryTicketSearch('#9599'), '9599');
  assert.equal(parsePhotoLibraryTicketSearch('  #9599  '), '9599');
  assert.equal(parsePhotoLibraryTicketSearch('14-4421'), null);
  assert.equal(parsePhotoLibraryTicketSearch(''), null);
  assert.equal(parsePhotoLibraryTicketSearch(null), null);
});
