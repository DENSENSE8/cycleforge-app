import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allowedTypesForPlatform,
  isTypeSettledForPlatform,
  defaultTypeForPlatform,
  isPairAllowed,
  reconcileTypeForPlatform,
  type PlatformTypeRule,
} from './platform-type-rules';

/** The seeded matrix: FBA is closed to returns; every other platform is open. */
const RULES: PlatformTypeRule[] = [
  { platform: 'fba', type: 'RETURN', isDefault: true },
];

/** A platform with a genuine CHOICE — two legal types, one pre-selected. */
const MULTI: PlatformTypeRule[] = [
  { platform: 'ebay', type: 'RETURN', isDefault: true },
  { platform: 'ebay', type: 'REPAIR', isDefault: false },
];

test('a platform with no rules is unconstrained (null, not empty)', () => {
  // null and [] mean opposite things — "no opinion" vs "nothing is legal".
  assert.equal(allowedTypesForPlatform(RULES, 'ebay'), null);
  assert.equal(allowedTypesForPlatform(RULES, ''), null);
  assert.equal(allowedTypesForPlatform(RULES, null), null);
});

test('a constrained platform returns exactly its allowed set', () => {
  assert.deepEqual(allowedTypesForPlatform(RULES, 'fba'), ['RETURN']);
  assert.deepEqual(allowedTypesForPlatform(MULTI, 'ebay'), ['RETURN', 'REPAIR']);
});

test('matching is case-insensitive on both sides', () => {
  // types.slug is lower ('return'), receiving.intake_type is upper ('RETURN').
  // A rule that stops matching on case is the whole failure mode.
  assert.deepEqual(allowedTypesForPlatform(RULES, 'FBA'), ['RETURN']);
  assert.equal(isPairAllowed([{ platform: 'FBA', type: 'return', isDefault: true }], 'fba', 'RETURN'), true);
});

test('an unconstrained platform allows any type', () => {
  assert.equal(isPairAllowed(RULES, 'ebay', 'PO'), true);
  assert.equal(isPairAllowed(RULES, 'walmart', 'TRADE_IN'), true);
});

test('a constrained platform rejects a type outside its set', () => {
  assert.equal(isPairAllowed(RULES, 'fba', 'PO'), false);
  assert.equal(isPairAllowed(RULES, 'fba', 'RETURN'), true);
});

test('an empty type is always allowed — a rule narrows a choice, never forces one', () => {
  // Clearing the type has to stay possible or a mis-scan cannot be corrected.
  assert.equal(isPairAllowed(RULES, 'fba', ''), true);
  assert.equal(isPairAllowed(RULES, 'fba', null), true);
});

test('default is only read from the flagged row', () => {
  assert.equal(defaultTypeForPlatform(RULES, 'fba'), 'RETURN');
  assert.equal(defaultTypeForPlatform(MULTI, 'ebay'), 'RETURN');
  assert.equal(defaultTypeForPlatform(RULES, 'ebay'), null);
});

test('reconcile keeps a legal type untouched', () => {
  assert.equal(reconcileTypeForPlatform(RULES, 'fba', 'RETURN'), 'RETURN');
  assert.equal(reconcileTypeForPlatform(RULES, 'ebay', 'PO'), 'PO');
});

test('reconcile switches an orphaned type when the platform has one answer', () => {
  // Picking FBA on a PO carton files it as a Return — no operator keystroke.
  assert.equal(reconcileTypeForPlatform(RULES, 'fba', 'PO'), 'RETURN');
});

test('reconcile fills an empty type from the default', () => {
  assert.equal(reconcileTypeForPlatform(RULES, 'fba', null), 'RETURN');
  assert.equal(reconcileTypeForPlatform(MULTI, 'ebay', ''), 'RETURN');
});

test('reconcile clears rather than guessing between two legal answers', () => {
  const ambiguous: PlatformTypeRule[] = [
    { platform: 'ebay', type: 'RETURN', isDefault: false },
    { platform: 'ebay', type: 'REPAIR', isDefault: false },
  ];
  // Illegal current type, no default, more than one option → clear it.
  assert.equal(reconcileTypeForPlatform(ambiguous, 'ebay', 'PO'), null);
});

test('reconcile never returns an illegal pair', () => {
  const cases: Array<[PlatformTypeRule[], string, string | null]> = [
    [RULES, 'fba', 'PO'],
    [RULES, 'fba', null],
    [MULTI, 'ebay', 'PO'],
    [RULES, 'ebay', 'PO'],
  ];
  for (const [rules, platform, current] of cases) {
    const next = reconcileTypeForPlatform(rules, platform, current);
    assert.equal(
      isPairAllowed(rules, platform, next),
      true,
      `reconcile(${platform}, ${current}) → ${next} must be legal`,
    );
  }
});

test('the pill settles only when the sole legal type is already set', () => {
  assert.equal(isTypeSettledForPlatform(RULES, 'fba', 'RETURN'), true);
  // Grandfathered illegal value — must stay editable, not lock on a wrong answer.
  assert.equal(isTypeSettledForPlatform(RULES, 'fba', 'PO'), false);
  // Nothing chosen yet is still a question.
  assert.equal(isTypeSettledForPlatform(RULES, 'fba', ''), false);
  // A genuine choice never settles, even sitting on the default.
  assert.equal(isTypeSettledForPlatform(MULTI, 'ebay', 'RETURN'), false);
  // Unconstrained platforms never settle.
  assert.equal(isTypeSettledForPlatform(RULES, 'ebay', 'PO'), false);
});
