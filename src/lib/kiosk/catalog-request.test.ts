/** The shared catalog query grammar both kiosk rails must answer identically. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readKioskCatalogQuery, toKioskCatalogResponse } from './catalog-request';

function parse(query: string) {
  return readKioskCatalogQuery(new URLSearchParams(query));
}

test('a query is self-scoping and drops the drilled category', () => {
  // A walk-in asking for a product does not care which category the staffer
  // was browsing. Scoping the search to it was the original defect.
  const parsed = parse('q=wave+radio&categoryId=42');
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.equal(parsed.options.query, 'wave radio');
  assert.equal(parsed.options.categoryId, null);
});

test('a request that names no scope at all is refused', () => {
  // Without this a bare GET would page the entire projection by accident.
  const parsed = parse('limit=50');
  assert.equal(parsed.ok, false);
});

test('mode=all outranks a stale categoryId the client still holds', () => {
  const parsed = parse('mode=all&categoryId=42');
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.equal(parsed.options.categoryId, null);
});

test('a sub-floor query is treated as absent, not rejected', () => {
  // The picker sends every keystroke. A 400 on the first character would flash
  // an error in the grid while someone is still typing.
  const parsed = parse('q=b&mode=all');
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.equal(parsed.options.query, null);
});

test('a sub-floor query with no other scope is still refused', () => {
  const parsed = parse('q=b');
  assert.equal(parsed.ok, false);
});

test('a barcode scopes the request on its own', () => {
  const parsed = parse('barcode=017817656320');
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.equal(parsed.options.barcode, '017817656320');
});

test('mode=favorites scopes to the rail the ROUTE named', () => {
  // The workspace is never the client's to choose — a device that could name it
  // would read another rail's curated list off a query string.
  const parsed = readKioskCatalogQuery(new URLSearchParams('mode=favorites&categoryId=42'), {
    favoritesWorkspace: 'repair',
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.equal(parsed.options.favoritesWorkspace, 'repair');
  assert.equal(parsed.options.categoryId, null);
});

test('a rail with no favorites list refuses mode=favorites', () => {
  assert.equal(parse('mode=favorites').ok, false);
});

test('a query outranks the favorites scope', () => {
  // Someone asking for a product wants the catalog, not what the counter pinned.
  const parsed = readKioskCatalogQuery(new URLSearchParams('mode=favorites&q=wave+radio'), {
    favoritesWorkspace: 'sales',
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.equal(parsed.options.favoritesWorkspace, null);
  assert.equal(parsed.options.query, 'wave radio');
});

test('limit is clamped and offset never goes negative', () => {
  const huge = parse('mode=all&limit=5000&offset=-10');
  assert.equal(huge.ok, true);
  if (!huge.ok) return;

  assert.equal(huge.options.limit, 100);
  assert.equal(huge.options.offset, 0);

  const garbage = parse('mode=all&limit=abc');
  assert.equal(garbage.ok, true);
  if (!garbage.ok) return;
  assert.equal(garbage.options.limit, 24);
});

test('the wire response flattens availability onto each product', () => {
  // ProductSelector reads `products[].availability`; a nested hit shape would
  // break the picker without its code being touched.
  const availability = {
    listedInStock: true,
    onHand: 4,
    bin: { label: 'Z1-A-03', barcode: 'Z1-A-03', qty: 4 },
    binCount: 1,
  };
  const wire = toKioskCatalogResponse({
    hits: [
      {
        product: {
          id: '7',
          name: 'Wave Radio II',
          sku: 'WR2',
          price: 199.99,
          thumbnailUrl: null,
          enabled: true,
          inStock: true,
          categoryIds: ['42'],
        },
        availability,
      },
    ],
    total: 1,
    limit: 24,
    offset: 0,
    hasMore: false,
  });

  assert.equal(wire.products.length, 1);
  assert.equal(wire.products[0]!.sku, 'WR2');
  assert.deepEqual(wire.products[0]!.availability, availability);
  assert.equal(wire.total, 1);
});
