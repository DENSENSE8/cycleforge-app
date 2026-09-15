/**
 * Availability decisions for the kiosk product searcher.
 *
 * The load-bearing rule here is that "untracked" and "zero" are different
 * answers. Most of the projected catalog has no `bin_contents` row, and
 * printing "Out of stock" for one of those sends a paying walk-in out the door.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBinLabel,
  isSearchableCatalogQuery,
  normalizeCatalogQuery,
  resolveStockState,
  stockBadgeLabel,
  summarizeAvailability,
} from './catalog-search-pure';

/** A joined search row with no bin rows — what the LATERAL yields for an untracked SKU. */
const untrackedRow = {
  in_stock: true,
  on_hand: null,
  bin_count: 0,
  bin_name: null,
  bin_barcode: null,
  bin_qty: null,
};

test('an untracked SKU is unknown, and prints no stock line at all', () => {
  const availability = summarizeAvailability(untrackedRow);

  assert.equal(availability.onHand, null);
  assert.equal(resolveStockState(availability), 'unknown');
  // null, not placeholder copy: most of the catalog is untracked, so a word
  // here would repeat on the majority of cards and carry no information.
  assert.equal(stockBadgeLabel(availability), null);
});

test('an untracked SKU the storefront calls unavailable is out of stock', () => {
  // The storefront flag is the only fact we hold about an untracked SKU, so it
  // decides. This is the one case where `onHand === null` still reads as out.
  const availability = summarizeAvailability({ ...untrackedRow, in_stock: false });

  assert.equal(resolveStockState(availability), 'out');
});

test('a bin-tracked count overrides a stale storefront flag', () => {
  // in_stock says sold out; we can physically see three on the shelf. The
  // count we can verify wins — it is the one a staffer can act on.
  const availability = summarizeAvailability({
    in_stock: false,
    on_hand: 3,
    bin_count: 1,
    bin_name: 'Z1-A-03',
    bin_barcode: 'Z1-A-03',
    bin_qty: 3,
  });

  assert.equal(resolveStockState(availability), 'low');
  assert.equal(stockBadgeLabel(availability), '3 in stock');
});

test('a tracked SKU counted down to zero is out of stock', () => {
  const availability = summarizeAvailability({ ...untrackedRow, on_hand: 0, bin_count: 2 });

  assert.equal(resolveStockState(availability), 'out');
  assert.equal(stockBadgeLabel(availability), 'Out of stock');
});

test('the low-stock boundary is inclusive and threshold-driven', () => {
  const three = summarizeAvailability({ ...untrackedRow, on_hand: 3, bin_count: 1 });
  const four = summarizeAvailability({ ...untrackedRow, on_hand: 4, bin_count: 1 });

  assert.equal(resolveStockState(three), 'low');
  assert.equal(resolveStockState(four), 'in_stock');
  // A bin that sets its own floor moves the boundary with it.
  assert.equal(resolveStockState(four, 4), 'low');
});

test('the bin barcode is the handle, falling back to the location name', () => {
  // Bin barcodes are the addressing scheme a staffer reads out loud ("Z1-A-03");
  // named zones like Showroom carry no barcode and must still be reachable.
  assert.equal(buildBinLabel({ bin_name: 'Zone 1 Shelf', bin_barcode: 'Z1-A-03' }), 'Z1-A-03');
  assert.equal(buildBinLabel({ bin_name: 'Showroom', bin_barcode: null }), 'Showroom');
  assert.equal(buildBinLabel({ bin_name: '  ', bin_barcode: '  ' }), null);
});

test('a bin is only reported when it has both a label and a quantity', () => {
  const noQty = summarizeAvailability({ ...untrackedRow, on_hand: 5, bin_name: 'Showroom', bin_qty: null });

  assert.equal(noQty.bin, null);
});

test('binCount carries every bin holding the SKU, not just the reported one', () => {
  // Drives the "+2" hint: the card names one bin to walk to but must not imply
  // it is the only place the SKU lives.
  const availability = summarizeAvailability({
    in_stock: true,
    on_hand: 9,
    bin_count: 3,
    bin_name: 'Z1-A-03',
    bin_barcode: 'Z1-A-03',
    bin_qty: 5,
  });

  assert.equal(availability.binCount, 3);
  assert.equal(availability.bin?.qty, 5);
  assert.equal(availability.onHand, 9);
});

test('a query is normalized before it reaches SQL', () => {
  assert.equal(normalizeCatalogQuery('  wave   radio  '), 'wave radio');
  assert.equal(normalizeCatalogQuery(null), '');
});

test('the search floor keeps single keystrokes off the database', () => {
  assert.equal(isSearchableCatalogQuery('b'), false);
  assert.equal(isSearchableCatalogQuery('  b '), false);
  assert.equal(isSearchableCatalogQuery('bo'), true);
});
