import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  amazonListingUrlForAsin,
  deskRowFromCsvRecord,
  inboundSourcePlatformForRaw,
  inboundSourceTypeForPlatform,
  isAmazonNativeReturnsRecord,
} from './desk-csv';

describe('inboundSourceTypeForPlatform', () => {
  it('maps amazon / ebay / zoho; goodwill → manual', () => {
    assert.equal(inboundSourceTypeForPlatform('amazon'), 'amazon');
    assert.equal(inboundSourceTypeForPlatform('AMZ'), 'amazon');
    assert.equal(inboundSourceTypeForPlatform('ebay'), 'ebay');
    assert.equal(inboundSourceTypeForPlatform('goodwill'), 'manual');
    assert.equal(inboundSourceTypeForPlatform('zoho'), 'zoho');
  });
});

describe('inboundSourcePlatformForRaw', () => {
  it('keeps goodwill / amazon paint; drops bare manual', () => {
    assert.equal(inboundSourcePlatformForRaw('goodwill'), 'goodwill');
    assert.equal(inboundSourcePlatformForRaw('amazon'), 'amazon');
    assert.equal(inboundSourcePlatformForRaw('manual'), null);
  });
});

describe('deskRowFromCsvRecord', () => {
  it('maps Goodwill CSV to manual ingest + platform stamp + default seller', () => {
    const row = deskRowFromCsvRecord({
      kind: 'purchase',
      source: 'goodwill',
      order_id: 'GW-9',
      sku: 'CAM-1',
      item_name: 'Camera',
      qty: '2',
    });
    assert.equal(row.sourceType, 'manual');
    assert.equal(row.sourcePlatform, 'goodwill');
    assert.equal(row.seller, 'Goodwill');
    assert.equal(row.orderId, 'GW-9');
    assert.equal(row.quantity, 2);
  });

  it('maps Amazon return CSV for unfound fix', () => {
    const row = deskRowFromCsvRecord({
      kind: 'return',
      platform: 'amazon',
      order_id: '111-222-333',
      sku: 'A1',
      tracking: '1Z999',
    });
    assert.equal(row.kind, 'return');
    assert.equal(row.receivingType, 'RETURN');
    assert.equal(row.sourceType, 'amazon');
    assert.equal(row.sourcePlatform, 'amazon');
    assert.equal(row.trackingNumber, '1Z999');
    assert.equal(row.amazonNativeReturn, undefined);
  });

  it('maps priority_tier from CSV', () => {
    const row = deskRowFromCsvRecord({
      source: 'goodwill',
      order_id: 'GW-1',
      sku: 'X',
      priority: '0',
      receiving_type: 'PO',
    });
    assert.equal(row.priorityTier, 0);
    assert.equal(row.receivingType, 'PO');
  });
});

describe('isAmazonNativeReturnsRecord', () => {
  it('detects space-separated Manage Returns headers', () => {
    assert.equal(
      isAmazonNativeReturnsRecord({
        'Order ID': '111-222-333',
        ASIN: 'B0EXAMPLE1',
        'Amazon RMA ID': 'RMA123',
        'Tracking ID': '1Z999',
      }),
      true,
    );
  });

  it('detects hyphenated Prime CSV headers', () => {
    assert.equal(
      isAmazonNativeReturnsRecord({
        'Order-ID': '111-222-333',
        ASIN: 'B0EXAMPLE1',
        'Amazon-RMA-ID': 'RMA123',
        'Tracking-ID': '1Z999',
      }),
      true,
    );
  });

  it('rejects Cycle Forge desk CSV even with an ASIN-looking sku', () => {
    assert.equal(
      isAmazonNativeReturnsRecord({
        kind: 'return',
        source: 'amazon',
        order_id: '111-222-333',
        sku: 'B0EXAMPLE1',
      }),
      false,
    );
  });
});

describe('deskRowFromCsvRecord — Amazon native returns', () => {
  const spaceRow = {
    'Order ID': '111-7654321-1234567',
    'Order date': '2026-01-02',
    'Return request date': '2026-01-05',
    'Return request status': 'Approved',
    'Amazon RMA ID': 'amzn1.rma.v1.xyz',
    'Merchant RMA ID': '',
    'Label type': 'AmazonPrePaidLabel',
    'Return carrier': 'UPS',
    'Tracking ID': '1Z999AA10123456784',
    ASIN: 'B0ABC12345',
    'Merchant SKU': 'MSKU-IGNORED',
    'Item Name': 'Widget Pro',
    'Return quantity': '2',
    'Return Reason': 'UNWANTED_ITEM',
  };

  it('maps space-separated Manage Returns columns', () => {
    const row = deskRowFromCsvRecord(spaceRow);
    assert.equal(row.amazonNativeReturn, true);
    assert.equal(row.kind, 'return');
    assert.equal(row.sourceType, 'amazon');
    assert.equal(row.sourcePlatform, 'amazon');
    assert.equal(row.receivingType, 'RETURN');
    assert.equal(row.orderId, '111-7654321-1234567');
    assert.equal(row.sku, 'B0ABC12345');
    assert.equal(row.itemName, 'Widget Pro');
    assert.equal(row.quantity, 2);
    assert.equal(row.trackingNumber, '1Z999AA10123456784');
    assert.equal(row.carrierCode, 'UPS');
    assert.equal(row.rmaId, 'amzn1.rma.v1.xyz');
    assert.equal(row.returnReason, 'UNWANTED_ITEM');
    assert.equal(row.lineItemId, 'amzn1.rma.v1.xyz:B0ABC12345');
    assert.equal(row.listingUrl, amazonListingUrlForAsin('B0ABC12345'));
    assert.equal(row.skipReason, null);
    assert.ok(row.rawPayload);
  });

  it('maps hyphenated headers the same way', () => {
    const row = deskRowFromCsvRecord({
      'Order-ID': '111-1-1',
      'Return-request-status': 'Closed',
      'Amazon-RMA-ID': 'RMA9',
      'Tracking-ID': 'TRACK1',
      ASIN: 'B09ZZZZZZZ',
      'Item-Name': 'Thing',
      'Return-quantity': '1',
      'Return-Reason': 'DEFECTIVE',
      'Return-carrier': 'USPS',
    });
    assert.equal(row.amazonNativeReturn, true);
    assert.equal(row.orderId, '111-1-1');
    assert.equal(row.sku, 'B09ZZZZZZZ');
    assert.equal(row.rmaId, 'RMA9');
    assert.equal(row.lineItemId, 'RMA9:B09ZZZZZZZ');
    assert.equal(row.trackingNumber, 'TRACK1');
    assert.equal(row.skipReason, null);
  });

  it('marks Cancelled status as skipReason=cancelled', () => {
    const row = deskRowFromCsvRecord({
      ...spaceRow,
      'Return request status': 'Cancelled',
    });
    assert.equal(row.amazonNativeReturn, true);
    assert.equal(row.skipReason, 'cancelled');
  });

  it('marks canceled (US spelling) as cancelled', () => {
    const row = deskRowFromCsvRecord({
      ...spaceRow,
      'Return request status': 'Canceled',
    });
    assert.equal(row.skipReason, 'cancelled');
  });

  it('does not treat Merchant SKU as the match key (sku = ASIN)', () => {
    const row = deskRowFromCsvRecord(spaceRow);
    assert.equal(row.sku, 'B0ABC12345');
    assert.notEqual(row.sku, 'MSKU-IGNORED');
  });
});
