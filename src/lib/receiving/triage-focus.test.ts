import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveTriageFocus,
  triageFocusToTab,
  isPairingAnswered,
  PAIRING_ANSWERED_STATES,
  type TriageFocusFacts,
} from './triage-focus';

const base: TriageFocusFacts = {
  isClassified: true,
  isReturn: false,
  isStaged: true,
  isPaired: true,
  isTriageComplete: false,
};

describe('triageFocusToTab', () => {
  it('maps classify / stage / pair to SectionTabsSlider ids', () => {
    assert.equal(triageFocusToTab('classify'), 'overview');
    assert.equal(triageFocusToTab('stage'), 'staging');
    assert.equal(triageFocusToTab('pair'), 'pairing');
  });

  it('returns null for already-staged and none', () => {
    assert.equal(triageFocusToTab('already-staged'), null);
    assert.equal(triageFocusToTab('none'), null);
  });

  it('stays aligned with resolveTriageFocus order', () => {
    assert.equal(
      triageFocusToTab(resolveTriageFocus({ ...base, isClassified: false })),
      'overview',
    );
    assert.equal(
      triageFocusToTab(resolveTriageFocus({ ...base, isStaged: false })),
      'staging',
    );
    assert.equal(
      triageFocusToTab(resolveTriageFocus({ ...base, isPaired: false })),
      'pairing',
    );
  });
});

describe('pairing answered vocabulary', () => {
  // The triage metrics route counts the COMPLEMENT of this set as
  // "saved without pairing". Before 2026-08-02 it hand-typed `<> 'MATCHED'`,
  // so WAIVED — which `isTriagePaired` has counted as done since C6 — would
  // have been filed as a step the operator skipped. One vocabulary, two
  // readers; a second copy is how they drift.
  it('WAIVED is an answer, not a skipped step', () => {
    assert.equal(isPairingAnswered('WAIVED'), true);
    assert.equal(isPairingAnswered('MATCHED'), true);
  });

  it('UNFOUND and an unrecorded state are both unanswered', () => {
    // UNFOUND is "we looked and found nothing"; null is "nobody recorded
    // anything". Different facts, same answer to *this* question: the pairing
    // step did not conclude.
    assert.equal(isPairingAnswered('UNFOUND'), false);
    assert.equal(isPairingAnswered(null), false);
    assert.equal(isPairingAnswered(undefined), false);
    assert.equal(isPairingAnswered(''), false);
  });

  it('the set is exactly the two answers, so the SQL complement is exhaustive', () => {
    // The route interpolates these literals into a NOT IN. Growing the set
    // without revisiting that predicate is the failure this pins.
    assert.deepEqual([...PAIRING_ANSWERED_STATES], ['MATCHED', 'WAIVED']);
  });
});
