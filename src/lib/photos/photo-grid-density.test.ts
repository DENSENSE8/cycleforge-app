import assert from 'node:assert/strict';
import test from 'node:test';
import {
  photoGridImageUrl,
  photoGridTileRatio,
  photoLibraryShowsGridControls,
  photoLibraryShowsSelectControl,
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

test('Select is offered only where photo tiles actually render', () => {
  // Folder drill levels paint folder tiles — nothing to select.
  assert.equal(photoLibraryShowsSelectControl('folders', false), false);
  assert.equal(photoLibraryShowsSelectControl('folders', true), true);
  assert.equal(photoLibraryShowsSelectControl('list', false), true);
  assert.equal(photoLibraryShowsSelectControl('grid-sm', false), true);
});

test('density is offered only on photo tile grids', () => {
  assert.equal(photoLibraryShowsGridControls('list', true), false);
  assert.equal(photoLibraryShowsGridControls('folders', false), false);
  assert.equal(photoLibraryShowsGridControls('folders', true), true);
  assert.equal(photoLibraryShowsGridControls('grid-lg', false), true);
});
