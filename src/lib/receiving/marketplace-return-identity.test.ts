import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatMarketplaceReturnIdentityTitle,
  isMarketplaceReturnIntake,
} from './marketplace-return-identity';

const AMAZON_ORDER = '111-6986570-4552201';

test('Amazon RETURN paints AMZ – return – last8, never Order + full id', () => {
  const title = formatMarketplaceReturnIdentityTitle({
    orderId: AMAZON_ORDER,
    sourcePlatform: 'amazon',
    returnPlatform: 'AMZ',
    receivingType: 'RETURN',
  });
  // last-8 of the id is '-4552201'; the leading hyphen is dropped so the
  // en-dash join never renders as a double dash.
  assert.equal(title, 'AMZ – return – 4552201');
  assert.ok(title && !title.includes('Order'));
  assert.ok(title && !title.includes(AMAZON_ORDER));
});

test('Amazon purchase (PO) is not a return identity', () => {
  assert.equal(isMarketplaceReturnIntake({ orderId: AMAZON_ORDER, receivingType: 'PO' }), false);
  assert.equal(
    formatMarketplaceReturnIdentityTitle({
      orderId: AMAZON_ORDER,
      sourcePlatform: 'amazon',
      receivingType: 'PO',
    }),
    null,
  );
});

test('eBay RETURN uses eBay short + the abbreviated order id', () => {
  const orderId = '12-34567-89012';
  assert.equal(
    formatMarketplaceReturnIdentityTitle({
      orderId,
      sourcePlatform: 'ebay',
      receivingType: 'RETURN',
    }),
    // Was `67-89012` — a blind `slice(-8)` through the middle of a segment,
    // which reads as a different order to anyone checking it against a label
    // (operator 2026-09-12: cut on the delimiter).
    'eBay – return – 89012',
  );
});

test('carton intake_type RETURN is enough without is_return', () => {
  assert.equal(
    formatMarketplaceReturnIdentityTitle({
      orderId: AMAZON_ORDER,
      sourcePlatform: 'amazon',
      cartonIntakeType: 'RETURN',
    }),
    'AMZ – return – 4552201',
  );
});
