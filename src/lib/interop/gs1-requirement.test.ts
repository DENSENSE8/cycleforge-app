/** `resolveGs1Requirement` — does this tenant need a licensed GS1 key? */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveGs1Requirement,
  type Gs1ComplianceAnswers,
  type Gs1OrgIdentity,
} from './gs1-keys';

/** A licensed-SHAPED prefix: not a real registration, just not an example one. */
const LICENSED_PREFIX = '0812345';
/** GS1's own documentation prefix — must never count as compliance. */
const PLACEHOLDER_PREFIX = '0614141';

const REFURB_ONLY: Gs1ComplianceAnswers = {
  hasNewInventory: false,
  sellsOnAmazon: false,
  gs1Status: null,
};

test('unanswered is never unmet — a tenant who was not asked has not failed', () => {
  for (const answers of [
    undefined,
    null,
    {},
    { hasNewInventory: null, sellsOnAmazon: null },
    // Half-answered still counts as unanswered: the flow is two questions.
    { hasNewInventory: true, sellsOnAmazon: null },
    { hasNewInventory: null, sellsOnAmazon: true },
  ] as Array<Gs1ComplianceAnswers | null | undefined>) {
    const r = resolveGs1Requirement(answers);
    assert.equal(r.answered, false, `${JSON.stringify(answers)} should read unanswered`);
    assert.equal(r.unmet, false, `${JSON.stringify(answers)} must not nag`);
  }
});

test('the dogfood case — refurb on eBay — needs nothing at all', () => {
  const r = resolveGs1Requirement(REFURB_ONLY);
  assert.equal(r.answered, true, 'answering "no" IS an answer');
  assert.equal(r.required, false);
  assert.deepEqual(r.reasons, []);
  assert.equal(r.unmet, false);
});

test('either question alone triggers the requirement, and says which', () => {
  const newOnly = resolveGs1Requirement({ hasNewInventory: true, sellsOnAmazon: false });
  assert.equal(newOnly.required, true);
  assert.deepEqual(newOnly.reasons, ['new-inventory']);

  const amazonOnly = resolveGs1Requirement({ hasNewInventory: false, sellsOnAmazon: true });
  assert.equal(amazonOnly.required, true);
  assert.deepEqual(amazonOnly.reasons, ['amazon']);

  const both = resolveGs1Requirement({ hasNewInventory: true, sellsOnAmazon: true });
  assert.deepEqual(both.reasons, ['new-inventory', 'amazon']);
});

test('a required tenant with no answer on HOW they get GTINs is unmet', () => {
  const r = resolveGs1Requirement({ hasNewInventory: true, sellsOnAmazon: true, gs1Status: null });
  assert.equal(r.unmet, true);

  const explicitNone = resolveGs1Requirement({
    hasNewInventory: false, sellsOnAmazon: true, gs1Status: 'none',
  });
  assert.equal(explicitNone.unmet, true, '"none" is the one nag state');
});

test('per-item GTINs and brand exemption CLEAR the requirement with no org-level value', () => {
  // The regression this pins: both store nothing in settings.gs1, so testing
  // hasCompanyPrefix alone would leave these tenants permanently non-compliant.
  for (const gs1Status of ['per-item', 'exempt'] as const) {
    const r = resolveGs1Requirement({ hasNewInventory: true, sellsOnAmazon: true, gs1Status });
    assert.equal(r.required, true, `${gs1Status}: still required`);
    assert.equal(r.unmet, false, `${gs1Status}: must not nag`);
  }
});

test('claiming a prefix only clears once real digits survive the refusal', () => {
  const answers: Gs1ComplianceAnswers = {
    hasNewInventory: true, sellsOnAmazon: true, gs1Status: 'prefix',
  };

  const real: Gs1OrgIdentity = { companyPrefix: LICENSED_PREFIX };
  assert.equal(resolveGs1Requirement(answers, real).unmet, false);

  // Claimed but never entered — exactly the half-finished state the flow exists
  // to surface, so it must stay unmet rather than silently pass.
  assert.equal(resolveGs1Requirement(answers, {}).unmet, true, 'empty prefix');
  assert.equal(
    resolveGs1Requirement(answers, { companyPrefix: '' }).unmet,
    true,
    'blank string prefix',
  );
  // GS1's documentation prefix is what `resolveGs1Identity` drops. A tenant who
  // pasted it has not licensed anything.
  assert.equal(
    resolveGs1Requirement(answers, { companyPrefix: PLACEHOLDER_PREFIX }).unmet,
    true,
    'placeholder prefix must not count as compliance',
  );
});

test('a GLN is irrelevant to the verdict — it answers a different question', () => {
  // A GLN identifies a warehouse for an EDI/EPCIS partner; it is not what
  // Amazon checks. Holding one must not clear a GTIN requirement, and lacking
  // one must not create a requirement.
  const withGln: Gs1OrgIdentity = { gln: '0812345000009' };
  assert.equal(
    resolveGs1Requirement({ hasNewInventory: true, sellsOnAmazon: true, gs1Status: 'none' }, withGln).unmet,
    true,
    'a GLN does not satisfy a GTIN requirement',
  );
  assert.equal(
    resolveGs1Requirement(REFURB_ONLY, withGln).required,
    false,
    'a GLN does not create a requirement either',
  );
});

test('a status answer alone never creates a requirement', () => {
  // Someone who says "we have a prefix" but sells only refurb on eBay still
  // needs nothing — the requirement comes from inventory + channel, not from
  // what they happen to own.
  const r = resolveGs1Requirement({ ...REFURB_ONLY, gs1Status: 'none' });
  assert.equal(r.required, false);
  assert.equal(r.unmet, false);
});
