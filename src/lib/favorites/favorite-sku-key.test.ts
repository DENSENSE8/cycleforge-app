/**
 * The favorites KEY, as behaviour.
 *
 * Two surfaces answer "is this tile favorited": the picker, from a set of keys,
 * and SQL, from `favorite_skus.sku_normalized`. A SKU typed with a space, a
 * dash or a lowercase suffix is the SAME favorite — get that wrong and a star
 * lands on a tile whose twin in the grid stays hollow.
 *
 * Run: npx tsx --test src/lib/favorites/favorite-sku-key.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFavoriteSkuKeySet,
  isFavoriteSku,
  normalizeFavoriteSku,
  selectFavoriteCatalogProducts,
} from './favorite-sku-key';

test('separator and case differences are the same favorite', () => {
  const key = normalizeFavoriteSku('00128-RS');
  assert.equal(normalizeFavoriteSku(' 00128 rs '), key);
  assert.equal(normalizeFavoriteSku('00128_Rs'), key);
  assert.equal(key, '00128rs');
});

test('a SKU-less row can never be favorited by accident', () => {
  // A blank key would otherwise match every blank SKU in the catalog.
  assert.equal(normalizeFavoriteSku('  '), '');
  assert.equal(normalizeFavoriteSku(null), '');
  assert.equal(isFavoriteSku(buildFavoriteSkuKeySet(['']), ''), false);
  assert.equal(isFavoriteSku(buildFavoriteSkuKeySet(['-- --']), '///'), false);
});

test('the tile star reads through the same folding as the list', () => {
  const keys = buildFavoriteSkuKeySet(['00128-RS', null, ' 991-rs ']);
  assert.equal(isFavoriteSku(keys, '00128 rs'), true);
  assert.equal(isFavoriteSku(keys, '991-RS'), true);
  assert.equal(isFavoriteSku(keys, '00129-RS'), false);
});

test('favorites paint in curated order, not catalog order', () => {
  // `sort_order` is the whole point of a curated list: the counter pins the
  // common repair first. The catalog hands rows back by name.
  const catalog = [
    { sku: '991-RS', name: 'Acoustimass' },
    { sku: '00128-RS', name: 'Wave Radio' },
    { sku: '777-RS', name: 'Not pinned' },
  ];
  const picked = selectFavoriteCatalogProducts(catalog, ['00128rs', '991rs']);
  assert.deepEqual(
    picked.map((p) => p.sku),
    ['00128-RS', '991-RS'],
  );
});

test('a favorite with no catalog row is not a tile', () => {
  // The listing IS the product — a tile with no price and no photo is noise.
  const picked = selectFavoriteCatalogProducts([{ sku: '991-RS' }], ['retiredrs', '991rs']);
  assert.deepEqual(
    picked.map((p) => p.sku),
    ['991-RS'],
  );
});

test('a repeated key does not paint the same product twice', () => {
  const picked = selectFavoriteCatalogProducts([{ sku: '991-RS' }], ['991rs', '991rs']);
  assert.equal(picked.length, 1);
});
