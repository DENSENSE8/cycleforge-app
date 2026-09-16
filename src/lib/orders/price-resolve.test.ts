import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { resolveLinePrice, type PriceFacts } from './price-resolve';

const NOTHING: PriceFacts = {
  saleAmount: null,
  currency: null,
  unitListingCents: null,
  listingCents: null,
  listingPlatform: null,
  orderPlatform: null,
};

test('a realised sale outranks a listing, however fresh that listing is', () => {
  // The listing is the number a lister changed this morning; sale_amount is
  // what the buyer paid. Letting the ask win would rewrite revenue.
  const resolved = resolveLinePrice({
    ...NOTHING,
    saleAmount: '51.97',
    currency: 'USD',
    listingCents: 8999,
    listingPlatform: 'ecwid',
    orderPlatform: 'ecwid',
  });
  assert.equal(resolved.cents, 5197);
  assert.equal(resolved.source, 'sold');
  assert.equal(resolved.isEstimate, false);
  assert.equal(resolved.platform, null);
});

test('NUMERIC(12,2) arrives as a string and converts to exact cents', () => {
  // node-postgres hands NUMERIC back as text precisely because the float is
  // lossy; these are the values live prod actually carries.
  assert.equal(resolveLinePrice({ ...NOTHING, saleAmount: '19.00' }).cents, 1900);
  assert.equal(resolveLinePrice({ ...NOTHING, saleAmount: '51.97' }).cents, 5197);
  assert.equal(resolveLinePrice({ ...NOTHING, saleAmount: '0.07' }).cents, 7);
  assert.equal(resolveLinePrice({ ...NOTHING, saleAmount: '1010.10' }).cents, 101010);
  // 8.29 * 100 === 828.9999999999999 in IEEE-754; the integer path must not.
  assert.equal(resolveLinePrice({ ...NOTHING, saleAmount: '8.29' }).cents, 829);
});

test('a $0.00 sale is realised revenue, not a missing price', () => {
  const resolved = resolveLinePrice({ ...NOTHING, saleAmount: '0.00' });
  assert.equal(resolved.cents, 0);
  assert.equal(resolved.source, 'sold');
});

test('malformed sale_amount resolves to unknown with null cents, never 0', () => {
  for (const bad of ['', '  ', 'abc', '$19.00', '19.00 USD', 'NaN', '1.234', '1e3']) {
    const resolved = resolveLinePrice({ ...NOTHING, saleAmount: bad });
    assert.equal(resolved.cents, null, `expected null cents for ${JSON.stringify(bad)}`);
    assert.equal(resolved.source, 'unknown');
    assert.equal(resolved.isEstimate, false);
  }
});

test('an unreadable sale_amount degrades to a labelled estimate, not a blank', () => {
  const resolved = resolveLinePrice({
    ...NOTHING,
    saleAmount: 'n/a',
    listingCents: 4500,
    listingPlatform: 'ecwid',
    orderPlatform: 'ecwid',
  });
  assert.equal(resolved.cents, 4500);
  assert.equal(resolved.source, 'listing');
  assert.equal(resolved.isEstimate, true);
});

test('a listing is reported with its own platform, never the order\'s', () => {
  // Own-channel listing: the estimate and the order agree, so the desk can
  // trust it.
  const ownChannel = resolveLinePrice({
    ...NOTHING,
    listingCents: 12999,
    listingPlatform: 'ecwid',
    orderPlatform: 'ecwid',
  });
  assert.equal(ownChannel.source, 'listing');
  assert.equal(ownChannel.platform, 'ecwid');

  // Foreign-channel listing (the only listing we have for an eBay line): the
  // number still beats a dash, but it MUST stay attributed to ecwid — a desk
  // relabelled to 'eBay' would read as this channel's own ask.
  const foreignChannel = resolveLinePrice({
    ...NOTHING,
    listingCents: 12999,
    listingPlatform: 'ecwid',
    orderPlatform: 'eBay',
  });
  assert.equal(foreignChannel.platform, 'ecwid');
  assert.equal(foreignChannel.isEstimate, true);
});

test('the allocated unit outranks the SKU listing', () => {
  // A unit priced away from its SKU was priced away for a reason (grade,
  // damage, bundle); the SKU ask must not overwrite that judgement.
  const resolved = resolveLinePrice({
    ...NOTHING,
    unitListingCents: 7500,
    listingCents: 12999,
    listingPlatform: 'ecwid',
    orderPlatform: 'ecwid',
  });
  assert.equal(resolved.cents, 7500);
  assert.equal(resolved.source, 'unit');
  assert.equal(resolved.isEstimate, true);
  assert.equal(resolved.platform, null);
});

test('isEstimate is false only for a realised sale', () => {
  assert.equal(resolveLinePrice({ ...NOTHING, saleAmount: '19.00' }).isEstimate, false);
  assert.equal(resolveLinePrice({ ...NOTHING, unitListingCents: 500 }).isEstimate, true);
  assert.equal(resolveLinePrice({ ...NOTHING, listingCents: 500 }).isEstimate, true);
  // `unknown` carries no number, so there is nothing to call an estimate.
  assert.equal(resolveLinePrice(NOTHING).isEstimate, false);
});

test('currency falls back to USD but a stored code is preserved', () => {
  assert.equal(resolveLinePrice({ ...NOTHING, saleAmount: '19.00', currency: null }).currency, 'USD');
  assert.equal(resolveLinePrice({ ...NOTHING, saleAmount: '19.00', currency: 'CAD' }).currency, 'CAD');
  assert.equal(resolveLinePrice({ ...NOTHING, saleAmount: '19.00', currency: ' eur ' }).currency, 'EUR');
  // Junk in the column is not a currency; USD is the org's books.
  assert.equal(resolveLinePrice({ ...NOTHING, saleAmount: '19.00', currency: 'US Dollars' }).currency, 'USD');
  // The fallback must survive the unpriced path too, or a CAD line with no
  // price would paint a USD dash.
  assert.equal(resolveLinePrice({ ...NOTHING, currency: 'CAD' }).currency, 'CAD');
  assert.equal(resolveLinePrice(NOTHING).currency, 'USD');
});

test('a zero asking price is a sync artifact, not an offer', () => {
  // Importers write 0 for "price not set"; painting $0.00 on a desk would
  // read as free stock.
  assert.equal(resolveLinePrice({ ...NOTHING, listingCents: 0 }).source, 'unknown');
  assert.equal(resolveLinePrice({ ...NOTHING, unitListingCents: 0 }).source, 'unknown');
  // A zeroed unit listing must not hide a real SKU ask behind it.
  const resolved = resolveLinePrice({
    ...NOTHING,
    unitListingCents: 0,
    listingCents: 4500,
    listingPlatform: 'ecwid',
  });
  assert.equal(resolved.cents, 4500);
  assert.equal(resolved.source, 'listing');
});
