import assert from 'node:assert/strict';
import test from 'node:test';
import { marketplaceImageKey, marketplaceRenditionEdge, marketplaceThumbUrl } from './marketplace-thumb-url';

test('requests compact current and legacy eBay renditions', () => {
  assert.equal(
    marketplaceThumbUrl('https://i.ebayimg.com/images/g/example/s-l1600.jpg'),
    'https://i.ebayimg.com/images/g/example/s-l225.jpg',
  );
  assert.equal(
    marketplaceThumbUrl('https://i.ebayimg.com/00/s/abc/z/example/$_57.PNG?set_id=500F'),
    'https://i.ebayimg.com/00/s/abc/z/example/$_6.PNG?set_id=500F',
  );
});

test('requests a compact Amazon rendition and replaces an existing directive', () => {
  assert.equal(
    marketplaceThumbUrl('https://m.media-amazon.com/images/I/example.jpg'),
    'https://m.media-amazon.com/images/I/example._SL200_.jpg',
  );
  assert.equal(
    marketplaceThumbUrl('https://images-na.ssl-images-amazon.com/images/I/example._AC_SL1000_.jpg'),
    'https://images-na.ssl-images-amazon.com/images/I/example._SL200_.jpg',
  );
});

test('leaves internal and unrelated image URLs unchanged', () => {
  assert.equal(marketplaceThumbUrl('/api/photos/42/content?variant=thumb'), '/api/photos/42/content?variant=thumb');
  assert.equal(marketplaceThumbUrl('https://example.com/image.jpg'), 'https://example.com/image.jpg');
  assert.equal(marketplaceThumbUrl(null), null);
});

test('keys every rendition of one marketplace picture alike', () => {
  const sized = marketplaceImageKey('https://i.ebayimg.com/images/g/wuUAAOSwltNdcVgt/s-l1600.jpg');
  assert.equal(sized, 'ebay:/images/g/wuUAAOSwltNdcVgt');
  assert.equal(marketplaceImageKey('https://i.ebayimg.com/images/g/wuUAAOSwltNdcVgt/s-l140.webp'), sized);

  const legacy = 'https://i.ebayimg.com/00/s/MTIwMFgxNjAw/z/x8cAAeSw~WhqBkGt/$_57.PNG?set_id=880000500F';
  assert.equal(marketplaceImageKey(legacy), 'ebay:/00/s/MTIwMFgxNjAw/z/x8cAAeSw~WhqBkGt');
  assert.equal(marketplaceImageKey('https://i.ebayimg.com/00/s/MTIwMFgxNjAw/z/x8cAAeSw~WhqBkGt/$_12.PNG'), marketplaceImageKey(legacy));

  const amazon = marketplaceImageKey('https://m.media-amazon.com/images/I/61ffIQZCqCL.jpg');
  assert.equal(amazon, 'amazon:/images/I/61ffIQZCqCL');
  assert.equal(marketplaceImageKey('https://images-na.ssl-images-amazon.com/images/I/61ffIQZCqCL._AC_SL1000_.jpg'), amazon);
});

test('different pictures and non-marketplace URLs never share a key', () => {
  assert.notEqual(
    marketplaceImageKey('https://i.ebayimg.com/images/g/AAAA/s-l1600.jpg'),
    marketplaceImageKey('https://i.ebayimg.com/images/g/BBBB/s-l1600.jpg'),
  );
  assert.equal(marketplaceImageKey('https://example.com/images/g/AAAA/s-l1600.jpg'), null);
  assert.equal(marketplaceImageKey('/api/photos/42/content'), null);
  assert.equal(marketplaceImageKey(''), null);
  assert.equal(marketplaceRenditionEdge('https://example.com/s-l1600.jpg'), 0);
});

test('ranks the higher rendition above its thumb', () => {
  const edge = marketplaceRenditionEdge;
  assert.ok(edge('https://i.ebayimg.com/images/g/x/s-l1600.jpg') > edge('https://i.ebayimg.com/images/g/x/s-l225.jpg'));
  assert.ok(edge('https://i.ebayimg.com/images/g/x/s-l500.jpg') > edge('https://i.ebayimg.com/images/g/x/s-l140.jpg'));
  // Legacy numbered renditions are not ordered by number: $_57 original > $_12 full > $_1 gallery > $_6 small.
  assert.ok(edge('https://i.ebayimg.com/00/s/a/z/x/$_57.JPG') > edge('https://i.ebayimg.com/00/s/a/z/x/$_12.JPG'));
  assert.ok(edge('https://i.ebayimg.com/00/s/a/z/x/$_12.JPG') > edge('https://i.ebayimg.com/00/s/a/z/x/$_1.JPG'));
  assert.ok(edge('https://i.ebayimg.com/00/s/a/z/x/$_1.JPG') > edge('https://i.ebayimg.com/00/s/a/z/x/$_6.JPG'));
  assert.equal(edge('https://i.ebayimg.com/00/s/a/z/x/$_99.JPG'), 0, 'unknown legacy code ranks as unknown');
  // Amazon: the directive-free original outranks any sized render.
  assert.ok(edge('https://m.media-amazon.com/images/I/x.jpg') > edge('https://m.media-amazon.com/images/I/x._AC_SL1500_.jpg'));
  assert.ok(edge('https://m.media-amazon.com/images/I/x._AC_SL1500_.jpg') > edge('https://m.media-amazon.com/images/I/x._SL200_.jpg'));
});
