import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { receivingCompoundView } from './receiving-compound-view';

describe('receiving compound view listing join', () => {
  it('exposes the primary receiving listing as the product title href', () => {
    const view = receivingCompoundView(
      {
        id: 42,
        receiving_listing_url: 'https://www.ebay.com/itm/42',
        workflow_status: 'MATCHED',
      } as never,
      {
        title: 'Product 42',
        stateLabel: 'MATCHED',
        delayDays: null,
        tracking: null,
        orderId: null,
      },
    );

    assert.equal(view.titleHref, 'https://www.ebay.com/itm/42');
  });

  it('leaves the title without a href when no receiving listing exists', () => {
    const view = receivingCompoundView(
      { id: 43, workflow_status: 'MATCHED' } as never,
      {
        title: 'Product 43',
        stateLabel: 'MATCHED',
        delayDays: null,
        tracking: null,
        orderId: null,
      },
    );

    assert.equal(view.titleHref, null);
  });
});
