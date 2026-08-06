import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveReceivingOrderOpenUrl } from './resolve-receiving-order-open-url';

describe('resolveReceivingOrderOpenUrl', () => {
  it('prefers carton listing URL over marketplace order page', () => {
    assert.equal(
      resolveReceivingOrderOpenUrl(
        {
          receiving_listing_url: 'www.ebay.com/itm/123',
          source_order_id: '08-14924-82211',
          source_platform: 'ebay',
          inbound_source_type: 'ebay',
        },
        '08-14924-82211',
      ),
      'https://www.ebay.com/itm/123',
    );
  });

  it('falls back to marketplace order URL when no listing', () => {
    const url = resolveReceivingOrderOpenUrl(
      {
        receiving_listing_url: null,
        source_order_id: '08-14924-82211',
        source_platform: 'ebay',
        inbound_source_type: 'ebay',
      },
      '08-14924-82211',
    );
    assert.ok(url);
    assert.match(url!, /ebay\.com/);
    assert.match(url!, /08-14924-82211/);
  });

  it('returns null when neither listing nor marketplace URL resolves', () => {
    assert.equal(
      resolveReceivingOrderOpenUrl(
        {
          receiving_listing_url: null,
          source_order_id: null,
          source_platform: 'zoho',
          inbound_source_type: 'zoho',
        },
        'PO-12345',
      ),
      null,
    );
  });
});
