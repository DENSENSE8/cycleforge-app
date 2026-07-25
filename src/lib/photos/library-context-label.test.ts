import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describePhotoLibraryContext,
  photoLibraryPoLeafLabel,
  resolvePhotoLibraryFolderLeafLabel,
} from '@/lib/photos/library-context-label';

test('describePhotoLibraryContext prefers the source scope title when no narrower filter is set', () => {
  const { title, subtitle } = describePhotoLibraryContext({ sourceScope: 'claims' });

  assert.equal(title, 'Zendesk Claims');
  assert.equal(subtitle, 'Browse receiving, packing, and unit photos');
});

test('describePhotoLibraryContext prefers PO over receivingId when both are set', () => {
  const { title } = describePhotoLibraryContext({
    sourceScope: 'unboxing',
    receivingId: '88',
    poRef: '14-14825',
  });
  assert.equal(title, 'PO 14-14825');
});

test('photoLibraryPoLeafLabel formats unfound unboxing refs', () => {
  assert.equal(photoLibraryPoLeafLabel('PO_13204', 'unboxing'), 'PO Unfound — 13204');
  assert.equal(photoLibraryPoLeafLabel('14-1', 'packing'), 'Order 14-1');
});

test('resolvePhotoLibraryFolderLeafLabel prefers ticket → PO → carton', () => {
  assert.equal(
    resolvePhotoLibraryFolderLeafLabel({
      scope: 'unboxing',
      ticketId: '4821',
      poRef: '14-1',
      receivingId: '88',
    }),
    '#4821',
  );
  assert.equal(
    resolvePhotoLibraryFolderLeafLabel({
      scope: 'unboxing',
      poRef: '14-14825',
      receivingId: '88',
    }),
    'PO 14-14825',
  );
  assert.equal(
    resolvePhotoLibraryFolderLeafLabel({
      scope: 'unboxing',
      receivingId: '88',
    }),
    'Carton #88',
  );
});
