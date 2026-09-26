/** Sold-tier gate tests. */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GRADE_RANK,
  gradeMeetsSoldTier,
  gradesSatisfying,
  normalizeSoldTier,
} from './condition-tier';

test('bare category strings promise no tier', () => {
  // The live column's dominant value. A concrete mapping here would refuse
  // perfectly shippable USED_B stock for 2869 orders.
  for (const raw of ['USED', 'used', ' Used ', 'pre-owned', 'second hand', '', '   ']) {
    assert.equal(normalizeSoldTier(raw), null, `${JSON.stringify(raw)} must promise no tier`);
  }
  assert.equal(normalizeSoldTier(null), null);
  assert.equal(normalizeSoldTier(undefined), null);
});

test('internal enum values round-trip without being widened', () => {
  // `USED_A` also matches the REFURBISHED pattern. Exact enum values must win,
  // or a re-synced order would silently demand a better unit than it sold.
  assert.equal(normalizeSoldTier('USED_A'), 'USED_A');
  assert.equal(normalizeSoldTier('used_b'), 'USED_B');
  assert.equal(normalizeSoldTier('PARTS'), 'PARTS');
  assert.equal(normalizeSoldTier('BRAND_NEW'), 'BRAND_NEW');
});

test('marketplace tier names resolve to grades', () => {
  // These land in the same free-text column as the internal values.
  assert.equal(normalizeSoldTier('Certified - Refurbished'), 'LIKE_NEW');
  assert.equal(normalizeSoldTier('Excellent - Refurbished'), 'LIKE_NEW');
  assert.equal(normalizeSoldTier('Renewed Premium'), 'LIKE_NEW');
  assert.equal(normalizeSoldTier('Very Good'), 'REFURBISHED');
  assert.equal(normalizeSoldTier('very good'), 'REFURBISHED');
  assert.equal(normalizeSoldTier('Good - Refurbished'), 'USED_B');
  assert.equal(normalizeSoldTier('Acceptable'), 'USED_C');
  assert.equal(normalizeSoldTier('For parts or not working'), 'PARTS');
});

test('"like new" and "brand new" are not swallowed by the bare-new pattern', () => {
  // Pattern order is load-bearing: `\bnew\b` matches all three strings.
  assert.equal(normalizeSoldTier('Like New'), 'LIKE_NEW');
  assert.equal(normalizeSoldTier('Open Box'), 'LIKE_NEW');
  assert.equal(normalizeSoldTier('New'), 'BRAND_NEW');
  assert.equal(normalizeSoldTier('NEW'), 'BRAND_NEW');
});

test('an untiered sale still refuses a PARTS unit', () => {
  // The floor every marketplace shares. Without this, "no tier promised"
  // would let the auto-allocator ship a salvage unit against a real order.
  const verdict = gradeMeetsSoldTier('PARTS', null);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, 'PARTS_NOT_SOLD_AS_PARTS');
  assert.match(verdict.message, /not sold as parts/i);
});

test('a parts sale accepts a PARTS unit', () => {
  assert.equal(gradeMeetsSoldTier('PARTS', 'PARTS').ok, true);
});

test('an untiered sale accepts any functional grade', () => {
  for (const grade of ['USED_C', 'USED_B', 'USED_A', 'REFURBISHED', 'LIKE_NEW', 'BRAND_NEW'] as const) {
    assert.equal(gradeMeetsSoldTier(grade, null).ok, true, `${grade} must satisfy an untiered sale`);
  }
});

test('a unit below the promised tier is refused, above it is accepted', () => {
  const below = gradeMeetsSoldTier('USED_C', 'LIKE_NEW');
  assert.equal(below.ok, false);
  assert.equal(below.code, 'BELOW_TIER');
  assert.match(below.message, /USED_C.*LIKE_NEW/);

  assert.equal(gradeMeetsSoldTier('LIKE_NEW', 'LIKE_NEW').ok, true, 'exact tier match passes');
  assert.equal(gradeMeetsSoldTier('BRAND_NEW', 'LIKE_NEW').ok, true, 'over-delivery passes');
});

test('an ungraded unit is refused with a reason naming what is missing', () => {
  // Refurb programs can demand grading evidence for 180 days; an unknown grade
  // cannot be proven to meet a tier, so it must not be allocated silently.
  const verdict = gradeMeetsSoldTier(null, 'REFURBISHED');
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, 'UNGRADED');
  assert.match(verdict.message, /grade it before allocating/i);
  // Also refused when nothing was promised — the grade itself is the gap.
  assert.equal(gradeMeetsSoldTier(undefined, null).code, 'UNGRADED');
});

test('gradesSatisfying never offers PARTS unless parts were sold', () => {
  assert.equal(gradesSatisfying(null).includes('PARTS'), false);
  assert.equal(gradesSatisfying('USED_C').includes('PARTS'), false);
  assert.deepEqual(gradesSatisfying('PARTS')[gradesSatisfying('PARTS').length - 1], 'PARTS');
});

test('gradesSatisfying returns best-first', () => {
  // Display order for an operator picking manually; the auto-allocator
  // deliberately consumes the other end.
  const options = gradesSatisfying('USED_A');
  assert.deepEqual(options, ['BRAND_NEW', 'LIKE_NEW', 'REFURBISHED', 'USED_A']);
  const ranks = options.map((g) => GRADE_RANK[g]);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => b - a), 'must be descending by rank');
});
