import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { receivingGroupIdentity } from '@/lib/receiving/receiving-group-identity';

describe('receivingGroupIdentity', () => {
  it('prefers the Zoho PO number and paints it as a PO chip', () => {
    const id = receivingGroupIdentity([
      { zoho_purchaseorder_number: 'PO-4471', source_order_id: '20-51978' },
      { zoho_purchaseorder_number: 'PO-4471' },
    ]);
    assert.deepEqual(id, { kind: 'po', value: 'PO-4471' });
  });

  it('falls back to the PO id when only the id is present', () => {
    const id = receivingGroupIdentity([{ zoho_purchaseorder_id: '99001' }]);
    assert.deepEqual(id, { kind: 'po', value: '99001' });
  });

  /**
   * Marketplace buys carry no Zoho PO — `useReceivingGrouping` folds them on
   * `{source}:{order id}`, so the band must name the same thing.
   */
  it('uses the external order id for a marketplace fold, with its platform dot', () => {
    const id = receivingGroupIdentity([
      { inbound_source_type: 'ebay', source_order_id: '20-51978' },
    ]);
    assert.equal(id?.kind, 'order');
    assert.equal(id?.value, '20-51978');
    assert.ok(id?.platformLabel, 'a known source must supply a platform label');
  });

  it('returns null when the fold shares no identity — the band shows boxes only', () => {
    assert.equal(receivingGroupIdentity([{}, {}]), null);
  });

  it('ignores blank and whitespace-only identities', () => {
    assert.equal(
      receivingGroupIdentity([{ zoho_purchaseorder_number: '   ', source_order_id: '' }]),
      null,
    );
  });
});
