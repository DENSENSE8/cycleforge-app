import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  asinFromOrderItems,
  isAmazonOrderForItemRefresh,
} from './order-item-refresh-shared';
import type { AmazonOrderItemFacts } from './order-item-refresh-shared';

describe('isAmazonOrderForItemRefresh', () => {
  it('accepts Amazon MFN order-id shape', () => {
    assert.equal(isAmazonOrderForItemRefresh('111-2222222-3333333', 'zoho'), true);
  });

  it('accepts account_source containing amazon', () => {
    assert.equal(isAmazonOrderForItemRefresh('ORDER-9', 'Amazon USAV'), true);
  });

  it('rejects bare eBay-shaped ids without amazon source', () => {
    assert.equal(isAmazonOrderForItemRefresh('12-34567-89012', 'ebay'), false);
  });

  it('rejects empty order id', () => {
    assert.equal(isAmazonOrderForItemRefresh('', 'amazon'), false);
  });
});

describe('asinFromOrderItems', () => {
  it('returns uppercase ASIN from the representative item', () => {
    const items: AmazonOrderItemFacts[] = [
      { SellerSKU: 'SKU-1', ASIN: 'b0abc12345', Title: 'Widget' },
    ];
    assert.equal(asinFromOrderItems(items), 'B0ABC12345');
  });

  it('returns null when no ASIN', () => {
    assert.equal(asinFromOrderItems([{ SellerSKU: 'SKU-1', Title: 'Widget' }]), null);
  });
});
