import test from 'node:test';
import assert from 'node:assert/strict';
import {
  knownReturnClassification,
  resolveClaimSubjectIdentity,
} from '@/lib/zendesk-claim-subject-identity';
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
