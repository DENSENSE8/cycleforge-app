import test from 'node:test';
import assert from 'node:assert/strict';
import {
  knownReturnClassification,
  replaceClaimSubjectClaimTypeSegment,
  replaceClaimSubjectIdentitySegment,
  resolveClaimSubjectIdentity,
} from '@/lib/zendesk-claim-subject-identity';
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

test('replaceClaimSubjectIdentitySegment patches only the first // segment', () => {
  assert.equal(
    replaceClaimSubjectIdentitySegment(
      'eBay - Purchase order // Damage // PO 123 // TRK#1Z',
      'Amazon - Return',
    ),
    'Amazon - Return // Damage // PO 123 // TRK#1Z',
  );
  assert.equal(replaceClaimSubjectIdentitySegment('', 'FBA'), 'FBA');
});

test('replaceClaimSubjectClaimTypeSegment patches only the claim-type // segment', () => {
  assert.equal(
    replaceClaimSubjectClaimTypeSegment(
      'Unfound - Purchase order // Unfound — no PO match // TRK#1Z730376306',
      'Damage',
    ),
    'Unfound - Purchase order // Damage // TRK#1Z730376306',
  );
  assert.equal(
    replaceClaimSubjectClaimTypeSegment(
      'Return // Unfound — no PO match // TRK#1Z',
      'Damage',
    ),
    'Return // Damage // TRK#1Z',
    'identity stays put — claim flip must not invent a new identity',
  );
  assert.equal(
    replaceClaimSubjectClaimTypeSegment(
      'eBay - Purchase order // Damage // PO 123 // TRK#1Z',
      'Missing item',
    ),
    'eBay - Purchase order // Missing item // PO 123 // TRK#1Z',
  );
  assert.equal(
    replaceClaimSubjectClaimTypeSegment('free typed subject', 'Damage'),
    'free typed subject',
  );
});

test('claim flip through every CLAIM_TYPE_LABEL keeps Unfound identity (incl. Return)', () => {
  const identity = 'Unfound - Purchase order';
  const tail = 'TRK#1Z730376306';
  const seed = `${identity} // Unfound — no PO match // ${tail}`;
  for (const label of Object.values(CLAIM_TYPE_LABEL)) {
    const next = replaceClaimSubjectClaimTypeSegment(seed, label);
    const [first, claim, ...rest] = next.split(' // ');
    assert.equal(first, identity, `identity stable for claim "${label}"`);
    assert.equal(claim, label);
    assert.equal(rest.join(' // '), tail);
    assert.notEqual(first, 'Amazon', `claim "${label}" must not invent Amazon identity`);
    assert.notEqual(first, 'Return', `claim "${label}" must not paint Return identity`);
  }
});
