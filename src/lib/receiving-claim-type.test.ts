import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CLAIM_TYPE_LABEL, claimTypeExceptionCode, defaultReceivingClaimType, type ClaimType } from '@/lib/receiving-claim-type';
import { LOSS_EXCEPTION_CODES, isClaimCode, isInvestigationCode } from '@/lib/receiving/exception-codes';

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

  it('a QC fail seeds its claim before a short line, and a short line seeds missing', () => {
    assert.equal(defaultReceivingClaimType({ hasPo: true, qaStatus: 'FAILED_DAMAGED' }), 'damage');
    assert.equal(defaultReceivingClaimType({ hasPo: true, qaStatus: 'FAILED_FUNCTIONAL', quantityReceived: 0, quantityExpected: 2 }), 'vendor_defect');
    assert.equal(defaultReceivingClaimType({ hasPo: true, quantityReceived: 1, quantityExpected: 2 }), 'missing');
    // Over-received or an unknown expectation is not short.
    assert.equal(defaultReceivingClaimType({ hasPo: true, quantityReceived: 3, quantityExpected: 2 }), 'damage');
    assert.equal(defaultReceivingClaimType({ hasPo: true, quantityReceived: 0, quantityExpected: null }), 'damage');
    // Unfound still wins: we cannot claim against a PO we have not found.
    assert.equal(defaultReceivingClaimType({ receivingSource: 'unmatched', hasPo: false, quantityReceived: 0, quantityExpected: 1 }), 'unfound');
  });

  it('defaults to damage otherwise', () => {
    assert.equal(defaultReceivingClaimType({ hasPo: true }), 'damage');
  });
});

describe('claimTypeExceptionCode', () => {
  it('unfound is an investigation; vendor types are claims', () => {
    assert.equal(claimTypeExceptionCode('unfound', { hasOrder: false }), 'NO_PO');
    assert.ok(isInvestigationCode(claimTypeExceptionCode('unfound', { hasOrder: false })));
    for (const [type, code] of [['damage', 'DAMAGED'], ['missing', 'SHORT'], ['wrong_item', 'WRONG_ITEM'], ['vendor_defect', 'DEFECTIVE']] as const) {
      assert.equal(claimTypeExceptionCode(type, { hasOrder: true }), code);
      assert.ok(isClaimCode(code));
    }
  });

  it('a return is an investigation only while it has no order', () => {
    assert.equal(claimTypeExceptionCode('return', { hasOrder: false }), 'RETURN_NO_ORDER');
    assert.equal(claimTypeExceptionCode('return', { hasOrder: true }), null);
  });

  it('routing types record no reason, and nothing maps to a carrier loss code', () => {
    assert.equal(claimTypeExceptionCode('return_to_sender', { hasOrder: true }), null);
    assert.equal(claimTypeExceptionCode('repair_service', { hasOrder: false }), null);
    // An OPEN loss code writes the line off — only the write-off path may record one.
    for (const type of Object.keys(CLAIM_TYPE_LABEL) as ClaimType[]) {
      for (const hasOrder of [true, false]) {
        const code = claimTypeExceptionCode(type, { hasOrder });
        assert.ok(!(LOSS_EXCEPTION_CODES as readonly string[]).includes(code ?? ''), `${type} → ${code}`);
      }
    }
  });
});
