import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { fetchLinePhotos } from './line-photos';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function serve(routes: Record<string, unknown>) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    const hit = Object.keys(routes).find((prefix) => url.startsWith(prefix));
    return new Response(JSON.stringify(hit ? routes[hit] : {}), { status: hit ? 200 : 404 });
  }) as typeof fetch;
}

test('the row thumb and the stored listing copy of one picture collapse to the higher rendition', async () => {
  serve({
    '/api/photos/listing-gallery': {
      items: [
        {
          photoId: 7,
          displayUrl: '/api/photos/7/content',
          thumbUrl: '/api/photos/7/content?variant=thumb',
          legacyUrl: 'https://i.ebayimg.com/images/g/wuUAAOSwltNdcVgt/s-l1600.jpg',
        },
        // A different picture stays.
        { photoId: 8, displayUrl: '/api/photos/8/content', thumbUrl: '/api/photos/8/content?variant=thumb', legacyUrl: null },
      ],
    },
    '/api/photos/library': {
      photos: [
        // The same stored photo again (by id) and an operator shot.
        { id: 7, displayUrl: '/api/photos/7/content', thumbUrl: 't7', legacyUrl: 'https://i.ebayimg.com/images/g/wuUAAOSwltNdcVgt/s-l1600.jpg' },
        { id: 9, displayUrl: '/api/photos/9/content', thumbUrl: 't9', legacyUrl: null },
      ],
    },
  });

  const photos = await fetchLinePhotos({
    skuCatalogId: 12,
    sku: '00049-P-7-WH',
    itemNumber: null,
    catalogImageUrl: 'https://i.ebayimg.com/images/g/wuUAAOSwltNdcVgt/s-l225.jpg',
  });

  assert.deepEqual(
    photos.map((p) => [p.id, p.url, p.caption]),
    [
      [7, '/api/photos/7/content', 'Catalog image'],
      [8, '/api/photos/8/content', null],
      [9, '/api/photos/9/content', null],
    ],
  );
});

test('a lower rendition arriving after the higher one is dropped', async () => {
  serve({
    '/api/photos/library': {
      photos: [
        { id: 1, displayUrl: '/api/photos/1/content', thumbUrl: 't1', legacyUrl: 'https://i.ebayimg.com/00/s/a/z/x/$_57.JPG' },
        { id: 2, displayUrl: '/api/photos/2/content', thumbUrl: 't2', legacyUrl: 'https://i.ebayimg.com/00/s/a/z/x/$_12.JPG' },
      ],
    },
  });

  const photos = await fetchLinePhotos({ skuCatalogId: null, sku: 'SKU-1', itemNumber: null, catalogImageUrl: null });
  assert.deepEqual(photos.map((p) => p.id), [1]);
});
