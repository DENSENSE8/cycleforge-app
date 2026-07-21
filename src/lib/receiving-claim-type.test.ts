import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultReceivingClaimType } from '@/lib/receiving-claim-type';

describe('defaultReceivingClaimType', () => {
  it('defaults to return_to_sender when STN status is RETURNED', () => {
    assert.equal(
      defaultReceivingClaimType({
        shipmentStatus: 'RETURNED',
        receivingType: 'RETURN',
        hasPo: true,
      }),
      'return_to_sender',
    );
  });

  it('defaults to return for customer return intake when not RETURNED', () => {
    assert.equal(
      defaultReceivingClaimType({
        shipmentStatus: 'DELIVERED',
        receivingType: 'RETURN',
        hasPo: true,
      }),
      'return',
    );
    assert.equal(
      defaultReceivingClaimType({
        cartonIntakeType: 'RETURN',
        hasPo: false,
      }),
      'return',
    );
    assert.equal(
      defaultReceivingClaimType({
        intakeType: 'return',
        hasPo: false,
      }),
      'return',
    );
  });

  it('defaults to unfound for unmatched cartons without a PO', () => {
    assert.equal(
      defaultReceivingClaimType({
        receivingSource: 'unmatched',
        hasPo: false,
      }),
      'unfound',
    );
  });

  it('does not default to unfound when a PO is present', () => {
    assert.equal(
      defaultReceivingClaimType({
        receivingSource: 'unmatched',
        hasPo: true,
      }),
      'damage',
    );
  });

  it('defaults to damage otherwise', () => {
    assert.equal(defaultReceivingClaimType({ hasPo: true }), 'damage');
  });
});
