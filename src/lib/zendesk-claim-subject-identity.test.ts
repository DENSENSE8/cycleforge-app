import test from 'node:test';
import assert from 'node:assert/strict';
import {
  knownReturnClassification,
  resolveClaimSubjectIdentity,
} from '@/lib/zendesk-claim-subject-identity';
import { buildClaimSubject } from '@/lib/zendesk-claim-subject';
import { CLAIM_TYPE_LABEL } from '@/lib/receiving-claim-type';
import { returnPlatformForSource } from '@/lib/receiving/return-platform-for-source';

test('empty platform + Return type + claim Return → Unknown - Return (not bare Return)', () => {
  const identity = resolveClaimSubjectIdentity({
    sourcePlatform: null,
    receivingType: 'RETURN',
    isReturn: true,
    returnPlatform: null,
    claimTypeLabel: 'Return',
  });
  assert.equal(identity, 'Unknown - Return');
  assert.notEqual(identity, 'Return');
});

test('source_platform=fba + type Return → Amazon - Return when is_return lacks return_platform', () => {
  const identity = resolveClaimSubjectIdentity({
    sourcePlatform: 'fba',
    receivingType: 'RETURN',
    isReturn: false,
    claimTypeLabel: 'Return',
  });
  assert.equal(identity, 'Amazon - Return');
});

test('is_return + return_platform=FBA + claim Return → platform only (no duplicate Return)', () => {
  const identity = resolveClaimSubjectIdentity({
    sourcePlatform: 'fba',
    receivingType: 'RETURN',
    isReturn: true,
    returnPlatform: 'FBA',
    claimTypeLabel: 'Return',
  });
  // Full subject would otherwise read "Amazon return // Return // TRK#…" — the
  // claim-type segment already says Return, so the identity segment drops it.
  assert.equal(identity, 'Amazon');
});

test('is_return + source fba without return_platform → Amazon return via knownReturnClassification', () => {
  assert.equal(
    knownReturnClassification({ isReturn: true, sourcePlatform: 'fba' }),
    'FBA_RETURN',
  );
  const identity = resolveClaimSubjectIdentity({
    sourcePlatform: 'fba',
    receivingType: 'RETURN',
    isReturn: true,
    returnPlatform: null,
    claimTypeLabel: 'Return',
  });
  assert.equal(identity, 'Amazon');
});

test('is_return + return_platform=FBA + claim Damage → Amazon return (not a duplicate, still informative)', () => {
  const identity = resolveClaimSubjectIdentity({
    sourcePlatform: 'fba',
    receivingType: 'RETURN',
    isReturn: true,
    returnPlatform: 'FBA',
    claimTypeLabel: 'Damage',
  });
  assert.equal(identity, 'Amazon return');
});

test('is_return + return_platform=EBAY_DRAGONH + claim Return → eBay (DH) only, sub-account kept', () => {
  const identity = resolveClaimSubjectIdentity({
    sourcePlatform: 'ebay',
    receivingType: 'RETURN',
    isReturn: true,
    returnPlatform: 'EBAY_DRAGONH',
    claimTypeLabel: 'Return',
  });
  assert.equal(identity, 'eBay (DH)');
});

test('catalog platform label override wins over built-in eBay', () => {
  const identity = resolveClaimSubjectIdentity({
    sourcePlatform: 'ebay',
    receivingType: 'PO',
    claimTypeLabel: 'Damage',
    catalogPlatformLabel: 'FBA return',
  });
  assert.equal(identity, 'FBA return - Purchase order');
});

test('ebay + PO without catalog → eBay - Purchase order', () => {
  const identity = resolveClaimSubjectIdentity({
    sourcePlatform: 'ebay',
    receivingType: 'PO',
    claimTypeLabel: 'Damage',
  });
  // receivingLabelTypeDisplay('PO') → full face "Purchase order" (short "PO" is chips).
  assert.equal(identity, 'eBay - Purchase order');
});

test('is_return without any platform does not invent Amazon Return', () => {
  assert.equal(
    knownReturnClassification({ isReturn: true, returnPlatform: null, sourcePlatform: null }),
    null,
  );
  const identity = resolveClaimSubjectIdentity({
    sourcePlatform: null,
    receivingType: 'RETURN',
    isReturn: true,
    returnPlatform: null,
    claimTypeLabel: 'Return',
  });
  assert.equal(identity, 'Unknown - Return');
});

test('returnPlatformForSource maps FBA / Amazon / eBay for return cartons', () => {
  assert.equal(returnPlatformForSource('fba'), 'FBA');
  assert.equal(returnPlatformForSource('amazon'), 'AMZ');
  assert.equal(returnPlatformForSource('ebay'), 'EBAY_USAV');
  assert.equal(returnPlatformForSource('other'), null);
});

test('buildClaimSubject renders PO, Order and no-handle titles from one composer', () => {
  assert.equal(
    buildClaimSubject({
      identity: 'eBay - Purchase order',
      claimTypeLabel: 'Damage',
      poNumber: '123',
      tracking: '1Z',
    }),
    'eBay - Purchase order // Damage // PO 123 // TRK#1Z',
  );
  // An operator-linked order id is titled as an Order, never as a PO.
  assert.equal(
    buildClaimSubject({
      identity: 'Amazon Return',
      claimTypeLabel: 'Damage',
      orderId: '111-8911758-3549041',
      tracking: '1Z',
    }),
    'Amazon Return // Damage // Order 111-8911758-3549041 // TRK#1Z',
  );
  // A resolved PO outranks a leftover pending id.
  assert.equal(
    buildClaimSubject({
      identity: 'Amazon Return',
      claimTypeLabel: 'Damage',
      poNumber: 'PO-6001',
      orderId: '111-8911758-3549041',
      tracking: null,
    }),
    'Amazon Return // Damage // PO PO-6001 // TRK#n/a',
  );
  assert.equal(
    buildClaimSubject({ identity: 'Unfound - Purchase order', claimTypeLabel: 'Damage' }),
    'Unfound - Purchase order // Damage // TRK#n/a',
  );
});

test('reclassifying re-renders the whole title and cannot drift the other parts', () => {
  const parts = {
    claimTypeLabel: 'Damage',
    orderId: '111-8911758-3549041',
    tracking: '1Z730376306',
  };
  const before = buildClaimSubject({ ...parts, identity: 'Unfound - Purchase order' });
  const after = buildClaimSubject({ ...parts, identity: 'Amazon Return' });
  assert.equal(before, 'Unfound - Purchase order // Damage // Order 111-8911758-3549041 // TRK#1Z730376306');
  assert.equal(after, 'Amazon Return // Damage // Order 111-8911758-3549041 // TRK#1Z730376306');
  // Every claim label keeps identity and the handle exactly where they were.
  for (const label of Object.values(CLAIM_TYPE_LABEL)) {
    const next = buildClaimSubject({ ...parts, claimTypeLabel: label, identity: 'Amazon Return' });
    const [identity, claim, handle, trk] = next.split(' // ');
    assert.equal(identity, 'Amazon Return');
    assert.equal(claim, label);
    assert.equal(handle, 'Order 111-8911758-3549041');
    assert.equal(trk, 'TRK#1Z730376306');
  }
});
