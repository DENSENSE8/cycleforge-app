import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  detectListingPlatform,
  resolveListingIdentity,
  shouldEnqueueCatalogLinkChore,
} from './order-catalog-link-chore-gates';

describe('shouldEnqueueCatalogLinkChore', () => {
  it('enqueues when raw Item Number is present and catalog miss', () => {
    assert.equal(
      shouldEnqueueCatalogLinkChore({ rawItemNumber: 'B0TESTASIN', skuCatalogId: null }),
      true,
    );
  });

  it('does not enqueue on catalog hit', () => {
    assert.equal(
      shouldEnqueueCatalogLinkChore({ rawItemNumber: 'B0TESTASIN', skuCatalogId: 42 }),
      false,
    );
  });

  it('does not enqueue blank Item Number (hard gate should already skip import)', () => {
    assert.equal(
      shouldEnqueueCatalogLinkChore({ rawItemNumber: '', skuCatalogId: null }),
      false,
    );
    assert.equal(
      shouldEnqueueCatalogLinkChore({ rawItemNumber: '   ', skuCatalogId: null }),
      false,
    );
  });
});

describe('detectListingPlatform', () => {
  it('maps common account_source values', () => {
    assert.equal(detectListingPlatform('ebay-us'), 'ebay');
    assert.equal(detectListingPlatform('Amazon'), 'amazon');
    assert.equal(detectListingPlatform('ecwid'), 'ecwid');
    assert.equal(detectListingPlatform('ECWID-RS'), 'ecwid');
    assert.equal(detectListingPlatform(''), 'unknown');
  });
});

describe('resolveListingIdentity', () => {
  it('keeps a real Item Number when the source carries one', () => {
    assert.equal(
      resolveListingIdentity({ itemNumber: '  126538271  ', sku: 'SKU-1', skuCatalogId: null }),
      '126538271',
    );
  });

  it('falls back to the SKU on a catalog miss (CSV / ShipStation lane)', () => {
    assert.equal(
      resolveListingIdentity({ itemNumber: '', sku: ' SKU-1 ', skuCatalogId: null }),
      'SKU-1',
    );
  });

  it('does NOT fall back on a catalog hit — the platform item id is truer', () => {
    assert.equal(
      resolveListingIdentity({ itemNumber: '', sku: 'SKU-1', skuCatalogId: 42 }),
      '',
    );
  });

  it('stays blank when the source names no product at all (Shopify / Square)', () => {
    assert.equal(
      resolveListingIdentity({ itemNumber: '', sku: '', skuCatalogId: null }),
      '',
    );
  });

  it('composes with the chore gate: a SKU-only miss now enqueues', () => {
    const identity = resolveListingIdentity({ itemNumber: '', sku: 'SKU-1', skuCatalogId: null });
    assert.equal(
      shouldEnqueueCatalogLinkChore({ rawItemNumber: identity, skuCatalogId: null }),
      true,
    );
  });
});
