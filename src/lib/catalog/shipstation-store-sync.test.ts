import test from 'node:test';
import assert from 'node:assert/strict';
import { shipstationMarketplaceSlug } from './shipstation-store-sync';

/**
 * DB-free unit tests for the marketplace → catalog-slug mapping (the pure half
 * of the ShipStation store sync; the SQL upsert is additive/idempotent by
 * construction and covered by the migration's ON CONFLICT contracts).
 * Run: node --import tsx --import ./scripts/register-server-only-shim.cjs --test src/lib/catalog/shipstation-store-sync.test.ts
 */

test('known marketplaces reuse the org catalog slugs (no duplicate platforms)', () => {
  assert.equal(
    shipstationMarketplaceSlug({ storeId: 1, storeName: null, marketplace: 'eBay', marketplaceName: 'eBay' }),
    'ebay',
  );
  assert.equal(
    shipstationMarketplaceSlug({ storeId: 2, storeName: null, marketplace: 'Amazon', marketplaceName: null }),
    'amazon',
  );
  assert.equal(
    shipstationMarketplaceSlug({ storeId: 3, storeName: null, marketplace: 'Square Online', marketplaceName: null }),
    'square',
    'branded name maps onto the canonical slug',
  );
});

test('unknown marketplaces slug from their name so the picker still classifies', () => {
  assert.equal(
    shipstationMarketplaceSlug({ storeId: 4, storeName: null, marketplace: 'Reverb', marketplaceName: 'Reverb' }),
    'reverb',
  );
});

test('a store with no marketplace yields null (no platform row invented)', () => {
  assert.equal(
    shipstationMarketplaceSlug({ storeId: 5, storeName: 'Manual', marketplace: null, marketplaceName: null }),
    null,
  );
  assert.equal(shipstationMarketplaceSlug({ storeId: 6, storeName: null, marketplace: '  ', marketplaceName: '' }), null);
});
