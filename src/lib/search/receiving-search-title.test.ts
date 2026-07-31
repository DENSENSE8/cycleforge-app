import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  receivingOrderIdFromParts,
  receivingPoIdentityTitle,
  receivingSearchTitle,
} from './receiving-search-title';

describe('receiving-search-title', () => {
  it('receivingOrderIdFromParts prefers PO over source order id', () => {
    assert.equal(receivingOrderIdFromParts('PO-99', '16-111'), 'PO-99');
    assert.equal(receivingOrderIdFromParts(null, '16-111'), '16-111');
    assert.equal(receivingOrderIdFromParts('', ''), '');
  });

  it('receivingPoIdentityTitle builds platform · PO/Order', () => {
    assert.equal(
      receivingPoIdentityTitle({
        poNumber: '12345',
        sourceOrderId: null,
        sourcePlatform: 'ebay',
      }),
      'ebay · PO 12345',
    );
    assert.equal(
      receivingPoIdentityTitle({
        poNumber: 'PO-00123',
        sourceOrderId: null,
        sourcePlatform: 'ebay',
      }),
      'ebay · PO-00123',
    );
    assert.equal(
      receivingPoIdentityTitle({
        poNumber: null,
        sourceOrderId: '16-14873-30704',
        sourcePlatform: 'ebay',
      }),
      'ebay · Order 16-14873-30704',
    );
  });

  it('receivingSearchTitle: multi distinct SKU → PO title', () => {
    assert.equal(
      receivingSearchTitle({
        lineCount: 3,
        distinctSkuCount: 2,
        poNumber: '999',
        sourceOrderId: null,
        sourcePlatform: 'ebay',
        firstItemName: 'Bose Wave',
        fallback: 'Receiving #1',
      }),
      'ebay · PO 999',
    );
  });

  it('receivingSearchTitle: single product → item name', () => {
    assert.equal(
      receivingSearchTitle({
        lineCount: 1,
        distinctSkuCount: 1,
        poNumber: '999',
        sourceOrderId: null,
        sourcePlatform: 'ebay',
        firstItemName: 'Bose Wave Music System',
        fallback: 'Receiving #1',
      }),
      'Bose Wave Music System',
    );
  });

  it('receivingSearchTitle falls back when no product/PO', () => {
    assert.equal(
      receivingSearchTitle({
        lineCount: 0,
        distinctSkuCount: 0,
        poNumber: null,
        sourceOrderId: null,
        sourcePlatform: null,
        firstItemName: null,
        fallback: 'Receiving #42',
      }),
      'Receiving #42',
    );
  });
});
