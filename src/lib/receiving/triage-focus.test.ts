import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveTriageFocus,
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

describe('resolveTriageFocus', () => {
  // The centre-tab mapping (`triageFocusToTab`) was removed on 2026-08-05 —
  // reference tools moved to the Displays push and Arrival no longer auto-opens
  // one on focus. The resolver still drives the "already staged" short-circuit.
  it('short-circuits to already-staged when the carton is complete', () => {
    assert.equal(resolveTriageFocus({ ...base, isTriageComplete: true }), 'already-staged');
  });

  it('returns the first unmet step in Scan→Classify→Stage→Pair order', () => {
    assert.equal(resolveTriageFocus({ ...base, isClassified: false }), 'classify');
    assert.equal(resolveTriageFocus({ ...base, isStaged: false }), 'stage');
    assert.equal(resolveTriageFocus({ ...base, isPaired: false }), 'pair');
  });

  it('returns none when every step is met', () => {
    assert.equal(resolveTriageFocus(base), 'none');
  });
});

describe('pairing answered vocabulary', () => {
  // The triage metrics route counts the COMPLEMENT of this set as "saved without pairing".
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
