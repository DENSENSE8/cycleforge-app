import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isPhotoLibraryFolderLevel,
  resolvePhotoLibraryFolderLevel,
} from '@/lib/photos/folder-level';
import { PHOTO_LIBRARY_FOLDER_LEAF_PAGE_SIZE } from '@/lib/photos/library-filter-state';

test('isPhotoLibraryFolderLevel accepts known levels only', () => {
  assert.equal(isPhotoLibraryFolderLevel('year'), true);
  assert.equal(isPhotoLibraryFolderLevel('entity'), true);
  assert.equal(isPhotoLibraryFolderLevel('nope'), false);
  assert.equal(isPhotoLibraryFolderLevel(null), false);
});

test('resolvePhotoLibraryFolderLevel maps URL path to aggregation level', () => {
  assert.deepEqual(resolvePhotoLibraryFolderLevel({}), {
    level: 'year',
    isLeaf: false,
    eyebrow: 'Years',
  });

  assert.equal(
    resolvePhotoLibraryFolderLevel({ dateFrom: '2026-01-01', dateTo: '2026-12-31' }).level,
    'month',
  );
  assert.equal(
    resolvePhotoLibraryFolderLevel({ dateFrom: '2026-07-01', dateTo: '2026-07-31' }).level,
    'week',
  );
  assert.equal(
    resolvePhotoLibraryFolderLevel({ dateFrom: '2026-07-21', dateTo: '2026-07-21' }).level,
    'entity',
  );
  assert.equal(
    resolvePhotoLibraryFolderLevel({ dateFrom: '2026-07-21', dateTo: '2026-07-21' }).isLeaf,
    false,
  );
  assert.deepEqual(
    resolvePhotoLibraryFolderLevel({
      dateFrom: '2026-07-21',
      dateTo: '2026-07-21',
      poRef: '14-1',
    }),
    { level: 'entity', isLeaf: true, eyebrow: 'Photos' },
  );
});

test('folder leaf page size is five', () => {
  assert.equal(PHOTO_LIBRARY_FOLDER_LEAF_PAGE_SIZE, 5);
});
