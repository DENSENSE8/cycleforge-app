import assert from 'node:assert/strict';
import test from 'node:test';
import {
  photoGridImageUrl,
  photoGridTileRatio,
  photoLibraryShowsGridControls,
  type PhotoGridDensity,
} from '@/lib/photos/photo-grid-density';

const photo = {
  thumbUrl: '/api/photos/42/content?variant=thumb',
  displayUrl: '/api/photos/42/content',
};

test('photoGridImageUrl keeps every tile density on the stable thumbnail URL', () => {
  for (const density of ['sm', 'md', 'lg'] satisfies PhotoGridDensity[]) {
    assert.equal(photoGridImageUrl(photo, density), photo.thumbUrl);
  }
});

test('large photo tiles retain their natural aspect layout', () => {
  assert.equal(photoGridTileRatio('sm'), 'square');
  assert.equal(photoGridTileRatio('md'), 'square');
  assert.equal(photoGridTileRatio('lg'), 'natural');
});

// `photoLibraryShowsSelectControl` was deleted with the folder drill: every
// surviving view paints photo tiles, so the gate had no remaining case to
// express. Its test goes with it rather than asserting a dead contract — see
// the note on `photoLibraryShowsGridControls` in photo-grid-density.ts.

test('density is offered only on photo tile grids', () => {
  // `folderIsLeaf` is gone with the drill; the view alone decides now.
  assert.equal(photoLibraryShowsGridControls('list'), false);
  assert.equal(photoLibraryShowsGridControls('grid-sm'), true);
  assert.equal(photoLibraryShowsGridControls('grid-lg'), true);
  assert.equal(photoLibraryShowsGridControls('grid-ticket'), true);
});
