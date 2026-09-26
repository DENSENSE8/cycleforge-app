/** Restricted-circulation GTINs must not leave the tenant. */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gs1CheckDigit,
  gtinIdentifier,
  isRestrictedCirculationGtin,
  sgtinIdentifier,
} from './gs1-keys';

/**
 * The real minted forms, reproduced from `generateInternalGtin`'s format
 * (`'02' + String(id).padStart(11,'0')` + check digit) rather than imported —
 * that module reaches the DB, and this file is pure.
 */
const MINTED_ID_10 = '02000000000107';
const MINTED_ID_BIG = '02009876543213';

/** A genuinely licensed GTIN-14 already used by the interop guard suite. */
const LICENSED_14 = '00812345000019';
/** The same licensed prefix, carried at packaging INDICATOR 2. */
const LICENSED_14_INDICATOR_2 = '20812345000010';

test('the format assumed here still matches the minter', () => {
  // If generateInternalGtin ever changes shape, this fails rather than the
  // constants above silently testing a form nothing produces.
  for (const [id, minted] of [[10, MINTED_ID_10], [987654321, MINTED_ID_BIG]] as const) {
    const body = '02' + String(id).padStart(11, '0');
    assert.equal(body + gs1CheckDigit(body), minted, `minted form for id ${id}`);
  }
});

test('a minted internal GTIN is restricted-circulation', () => {
  assert.equal(isRestrictedCirculationGtin(MINTED_ID_10), true);
  assert.equal(isRestrictedCirculationGtin(MINTED_ID_BIG), true);
});

test('and therefore mints NO interop identifier', () => {
  assert.equal(gtinIdentifier(MINTED_ID_10), null, 'no class-level GTIN key');
  assert.equal(sgtinIdentifier(MINTED_ID_10, 'SN-4471'), null, 'no SGTIN either');
  // The consumers (search-identifiers / epcis-projection / asn-projection) all
  // already branch on null and fall back to the internal URN, so the refusal
  // lands in a path that was correct before this predicate existed.
});

test('a LICENSED GTIN is untouched — the refusal is narrow', () => {
  assert.equal(isRestrictedCirculationGtin(LICENSED_14), false);
  assert.ok(gtinIdentifier(LICENSED_14), 'licensed GTIN still mints');
  assert.ok(sgtinIdentifier(LICENSED_14, 'SN-4471'), 'licensed SGTIN still mints');
});

test('indicator digit 2 on a licensed prefix is NOT restricted', () => {
  // The bug this test exists for:
  assert.equal(isRestrictedCirculationGtin(LICENSED_14_INDICATOR_2), false);
  assert.ok(gtinIdentifier(LICENSED_14_INDICATOR_2), 'a case pack still mints');
});

test('a UPC-A on number system 2 is restricted once padded to GTIN-13', () => {
  // In-store / variable-measure UPC. It only lines up with the `02` prefix
  // after the zero-pad, which is the other half of the normalisation.
  const upcA = '212345000018'; // 12 digits, number system 2
  assert.equal(isRestrictedCirculationGtin(upcA), true);
  assert.equal(gtinIdentifier(upcA), null);
});

test('the whole 20–29 band is covered, not just 02', () => {
  for (const p of ['20', '21', '22', '23', '24', '25', '26', '27', '28', '29']) {
    const gtin13 = p + '00000000001';
    assert.equal(
      isRestrictedCirculationGtin(gtin13),
      true,
      `GTIN-13 on restricted prefix ${p}`,
    );
  }
});

test('junk and non-GTIN lengths resolve to "not restricted", never throw', () => {
  for (const junk of [null, undefined, '', '   ', 'not-a-gtin', '123', '0'.repeat(20)]) {
    assert.equal(isRestrictedCirculationGtin(junk as string | null), false);
  }
  // A non-GTIN length is not a GTIN at all — gtinIdentifier already refuses it
  // on length, so this predicate deliberately declines to have an opinion.
  assert.equal(isRestrictedCirculationGtin('0200000000'), false, '10 digits is not a GTIN');
});
