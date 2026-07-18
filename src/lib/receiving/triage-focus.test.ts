import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveTriageFocus,
  triageFocusToTab,
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
