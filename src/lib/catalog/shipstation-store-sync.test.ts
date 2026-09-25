import test from 'node:test';
import assert from 'node:assert/strict';
import { isShipStationInternalStore, shipstationMarketplaceSlug, storesToPlace } from './shipstation-store-sync';

/**
 * DB-free unit tests for the marketplace → catalog-slug mapping (the pure half
 * of the ShipStation store sync; the SQL upsert is additive/idempotent by
 * construction and covered by the migration's ON CONFLICT contracts).
 * Run: node --import tsx --import ./scripts/register-server-only-shim.cjs --test src/lib/catalog/shipstation-store-sync.test.ts
 */

test('known marketplaces reuse the org catalog slugs (no duplicate platforms)', () => {
  assert.equal(shipstationMarketplaceSlug({ marketplace: 'eBay', marketplaceName: 'eBay' }), 'ebay');
  assert.equal(shipstationMarketplaceSlug({ marketplace: 'Amazon', marketplaceName: null }), 'amazon');
  assert.equal(
    shipstationMarketplaceSlug({ marketplace: 'Square Online', marketplaceName: null }),
    'square',
    'branded name maps onto the canonical slug',
  );
  assert.equal(
    shipstationMarketplaceSlug({ marketplace: null, marketplaceName: 'Ecwid by Lightspeed' }),
    'ecwid',
    'the live v1 name for Ecwid stores is the existing ecwid platform',
  );
});

test('unknown marketplaces slug from their name so the picker still classifies', () => {
  assert.equal(shipstationMarketplaceSlug({ marketplace: 'Reverb', marketplaceName: 'Reverb' }), 'reverb');
});

test('a store with no marketplace yields null (no platform row invented)', () => {
  assert.equal(shipstationMarketplaceSlug({ marketplace: null, marketplaceName: null }), null);
  assert.equal(shipstationMarketplaceSlug({ marketplace: '  ', marketplaceName: '' }), null);
});

test('ShipStation plumbing (manual orders, label API, rate browser) is never a platform', () => {
  for (const marketplaceName of ['ShipStation', 'Label Api', 'RateBrowser']) {
    assert.equal(isShipStationInternalStore({ marketplace: null, marketplaceName }), true, marketplaceName);
    assert.equal(shipstationMarketplaceSlug({ marketplace: null, marketplaceName }), null, marketplaceName);
  }
  assert.equal(isShipStationInternalStore({ marketplace: null, marketplaceName: 'Walmart' }), false);
});

test('a linked store is never re-placed; unlinked sales stores (retired too) are', () => {
  const store = (storeId: number, marketplaceName: string) => ({ storeId, marketplace: null, marketplaceName });
  const placed = storesToPlace(
    [
      store(246252, 'Ecwid by Lightspeed'), // linked by the operator → untouched
      store(216566, 'eBay'),
      store(999, 'Walmart'), // retired stores still own historical orders
      store(1, 'ShipStation'), // manual orders: plumbing, never placed
    ],
    new Set(['246252']),
  );
  assert.deepEqual(
    placed.map(({ store: s, slug }) => [s.storeId, slug]),
    [
      [216566, 'ebay'],
      [999, 'walmart'],
    ],
  );
});
