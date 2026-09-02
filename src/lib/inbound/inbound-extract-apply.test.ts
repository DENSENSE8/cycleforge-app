import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inboundFormPatchFromExtractDraft } from './inbound-extract-apply';

const current = {
  platform: 'amazon',
  orderId: '',
  seller: '',
  accountName: '',
  trackingNumber: '',
  carrierCode: '',
  listingUrl: '',
  returnReason: '',
  rmaId: '',
  sku: '',
  itemName: '',
  quantity: '1',
  lineItemId: '',
};

describe('inboundFormPatchFromExtractDraft', () => {
  it('fills eBay vendor PO facts from the first identified line', () => {
    const next = inboundFormPatchFromExtractDraft(
      {
        platform: 'ebay',
        order_id: '12-34567-89012',
        seller: 'vendor-shop',
        listing_url: 'https://www.ebay.com/itm/123',
        tracking_number: '1Z999',
        carrier_code: 'UPS',
        lines: [
          {
            sku: 'CUSTOM-LABEL',
            item_name: 'Widget',
            quantity: 2,
            line_item_id: '123456789012',
          },
        ],
      },
      current,
    );
    assert.equal(next.platform, 'ebay');
    assert.equal(next.orderId, '12-34567-89012');
    assert.equal(next.seller, 'vendor-shop');
    assert.equal(next.listingUrl, 'https://www.ebay.com/itm/123');
    assert.equal(next.sku, 'CUSTOM-LABEL');
    assert.equal(next.itemName, 'Widget');
    assert.equal(next.quantity, '2');
    assert.equal(next.lineItemId, '123456789012');
    assert.equal(next.trackingNumber, '1Z999');
    assert.equal(next.carrierCode, 'UPS');
  });

  it('does not clobber typed fields with empty extract values', () => {
    const next = inboundFormPatchFromExtractDraft(
      { order_id: '', lines: [{ sku: '' }] },
      { ...current, orderId: 'KEEP', sku: 'TYPED' },
    );
    assert.equal(next.orderId, 'KEEP');
    assert.equal(next.sku, 'TYPED');
    assert.equal(next.quantity, '1');
  });
});
