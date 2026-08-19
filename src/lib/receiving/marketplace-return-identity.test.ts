import test from 'node:test';
import assert from 'node:assert/strict';
import { getLast8 } from '@/lib/copy-chip-format';
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
  assert.equal(title, `AMZ – return – ${getLast8(AMAZON_ORDER)}`);
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

test('eBay RETURN uses eBay short + last8', () => {
  const orderId = '12-34567-89012';
  assert.equal(
    formatMarketplaceReturnIdentityTitle({
      orderId,
      sourcePlatform: 'ebay',
      receivingType: 'RETURN',
    }),
    `eBay – return – ${getLast8(orderId)}`,
  );
});

test('carton intake_type RETURN is enough without is_return', () => {
  assert.equal(
    formatMarketplaceReturnIdentityTitle({
      orderId: AMAZON_ORDER,
      sourcePlatform: 'amazon',
      cartonIntakeType: 'RETURN',
    }),
    `AMZ – return – ${getLast8(AMAZON_ORDER)}`,
  );
});
