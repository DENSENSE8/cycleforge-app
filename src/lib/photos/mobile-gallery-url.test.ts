import assert from 'node:assert/strict';
import test from 'node:test';

import {
  receivingLinePhotoHrefs,
  receivingPhotosGalleryUrl,
} from './mobile-gallery-url';

test('feed photo capture and gallery both return to the photo feed', () => {
  const hrefs = receivingLinePhotoHrefs({
    receivingId: 42,
    lineId: 7,
    itemName: 'Blue bicycle',
    poRef: 'PO-123',
    back: '/m/receiving',
  });

  assert.equal(
    hrefs.captureHref,
    '/m/r/42/photos?title=Blue+bicycle&poRef=PO-123&back=%2Fm%2Freceiving',
  );
  assert.equal(
    hrefs.galleryHref,
    '/m/r/42/photos?title=Blue+bicycle&poRef=PO-123&back=%2Fm%2Freceiving&mode=gallery',
  );
});

test('direct capture omits back so the photo route can use the scanned carton hub', () => {
  const hrefs = receivingLinePhotoHrefs({
    receivingId: 42,
    lineId: 7,
    sku: 'SKU-7',
  });

  assert.equal(hrefs.captureHref, '/m/r/42/photos?title=SKU-7');
  assert.equal(hrefs.galleryHref, '/m/r/42/photos?title=SKU-7&mode=gallery');
});

test('gallery mode preserves an existing return target', () => {
  assert.equal(
    receivingPhotosGalleryUrl('/m/r/42/photos?back=%2Fm%2Freceiving%2Fhistory'),
    '/m/r/42/photos?back=%2Fm%2Freceiving%2Fhistory&mode=gallery',
  );
});
