import assert from 'node:assert/strict';
import test from 'node:test';
import { marketplaceThumbUrl } from './marketplace-thumb-url';

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
