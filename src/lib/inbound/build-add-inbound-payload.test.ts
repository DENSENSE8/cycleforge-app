/**
 * Add inbound payload builder — unit tests.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildAddInboundImportBody,
  canSubmitAddInbound,
} from './build-add-inbound-payload';

const base = {
  platform: 'amazon',
  receivingType: 'PO',
  priority: 'auto',
  orderId: '111-222-333',
  sku: 'SKU-1',
  itemName: 'Widget',
  pickedCatalogId: null as number | null,
  quantity: '1',
  trackingNumber: '',
  listingUrl: '',
  seller: '',
  accountName: '',
  returnReason: '',
  rmaId: '',
};

describe('buildAddInboundImportBody', () => {
  it('includes sku_catalog_id for returns', () => {
    const body = buildAddInboundImportBody({
      ...base,
      receivingType: 'RETURN',
      trackingNumber: '1Z999',
      pickedCatalogId: 42,
      listingUrl: 'https://example.com/listing/sku-1',
    });
    assert.equal(body.kind, 'return');
    assert.equal(body.sku_catalog_id, 42);
    assert.equal(body.tracking_number, '1Z999');
    assert.equal(body.listing_url, 'https://example.com/listing/sku-1');
  });

  it('purchase omits sku_catalog_id', () => {
    const body = buildAddInboundImportBody({
      ...base,
      pickedCatalogId: 42,
    });
    assert.equal(body.kind, 'purchase');
    assert.equal(body.sku_catalog_id, undefined);
  });
});

describe('canSubmitAddInbound', () => {
  it('return requires tracking and catalog pick', () => {
    assert.equal(
      canSubmitAddInbound({
        ...base,
        receivingType: 'RETURN',
        trackingNumber: '',
        pickedCatalogId: 42,
      }),
      false,
    );
    assert.equal(
      canSubmitAddInbound({
        ...base,
        receivingType: 'RETURN',
        trackingNumber: '1Z999',
        pickedCatalogId: null,
      }),
      false,
    );
    assert.equal(
      canSubmitAddInbound({
        ...base,
        receivingType: 'RETURN',
        trackingNumber: '1Z999',
        pickedCatalogId: 42,
      }),
      true,
    );
  });
});
