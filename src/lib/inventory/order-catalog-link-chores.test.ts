import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  detectListingPlatform,
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
    assert.equal(detectListingPlatform(''), 'unknown');
  });
});
