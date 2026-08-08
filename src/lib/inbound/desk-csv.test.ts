import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deskRowFromCsvRecord,
  inboundSourcePlatformForRaw,
  inboundSourceTypeForPlatform,
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
