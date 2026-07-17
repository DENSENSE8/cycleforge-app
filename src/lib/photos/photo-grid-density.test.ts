import assert from 'node:assert/strict';
import test from 'node:test';
import {
  photoGridImageUrl,
  photoGridTileRatio,
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
