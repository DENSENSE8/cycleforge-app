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
    });
    assert.equal(body.kind, 'return');
    assert.equal(body.sku_catalog_id, 42);
    assert.equal(body.tracking_number, '1Z999');
  });

  it('purchase includes sku_catalog_id when inventory is paired', () => {
    const body = buildAddInboundImportBody({
      ...base,
      pickedCatalogId: 42,
      carrierCode: 'UPS',
      lineItemId: 'itm-9',
    });
    assert.equal(body.kind, 'purchase');
    assert.equal(body.sku_catalog_id, 42);
    assert.equal(body.carrier_code, 'UPS');
    assert.equal(body.line_item_id, 'itm-9');
  });
});

describe('canSubmitAddInbound', () => {
  it('purchase needs only order and item', () => {
    assert.equal(
      canSubmitAddInbound({
        ...base,
        itemName: '',
        quantity: '1',
        trackingNumber: '',
      }),
      true,
    );
    assert.equal(
      canSubmitAddInbound({
        ...base,
        orderId: '',
      }),
      false,
    );
    assert.equal(
      canSubmitAddInbound({
        ...base,
        sku: '',
        itemName: '',
      }),
      false,
    );
  });

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
