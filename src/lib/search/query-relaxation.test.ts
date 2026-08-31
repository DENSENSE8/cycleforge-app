import assert from 'node:assert/strict';
import test from 'node:test';

import { expandQuery } from '@/lib/search/query-expansion';
import { relaxationLadder, tokenSelectivity } from '@/lib/search/query-relaxation';

// ── selectivity heuristic ───────────────────────────────────────────────────

test('an identity fragment outranks a plain word', () => {
  assert.ok(tokenSelectivity('cf-7400') > tokenSelectivity('charger'));
});

test('a stopword is worth nothing', () => {
  assert.equal(tokenSelectivity('the'), 0);
  assert.equal(tokenSelectivity('where'), 0);
});

test('a longer word is rarer than a shorter one, up to the ceiling', () => {
  assert.ok(tokenSelectivity('charger') > tokenSelectivity('box'));
  // …but never enough to outrank an identity fragment.
  assert.ok(tokenSelectivity('extraordinarily') < tokenSelectivity('a1b2'));
});

// ── the ladder ──────────────────────────────────────────────────────────────

test('stopwords are shed before content words', () => {
  const ladder = relaxationLadder('where is the charger');
  assert.equal(ladder[0], 'where is charger');
});

test('the identity fragment survives every rung', () => {
  const ladder = relaxationLadder('dell 7400 charger');
  assert.ok(ladder.length > 0);
  assert.ok(ladder.every((rung) => rung.includes('7400')));
});

test('the shortest common word is shed first — a brand name narrows nothing here', () => {
  // "dell" is 4 chars against "charger" at 7, and in a warehouse full of Dell
  // units it is also the term that excludes the fewest rows. Both readings
  // agree: it goes first.
  assert.equal(relaxationLadder('dell 7400 charger')[0], '7400 charger');
});

test('a single token is never relaxed — a miss on an identifier is a real miss', () => {
  assert.deepEqual(relaxationLadder('SN12345678'), []);
  assert.deepEqual(relaxationLadder('1Z999AA10123456784'), []);
});

test('the ladder never relaxes down to an empty query', () => {
  for (const rung of relaxationLadder('the a of')) {
    assert.notEqual(rung.trim(), '');
  }
});

test('the ladder is capped — three misses, then tell them plainly', () => {
  assert.ok(relaxationLadder('one two three four five six seven').length <= 3);
});

test('the ladder never repeats a rung or re-emits the original', () => {
  const ladder = relaxationLadder('dell dell 7400');
  assert.equal(new Set(ladder).size, ladder.length);
  assert.ok(!ladder.includes('dell dell 7400'));
});

// ── synonyms compose with dropping ──────────────────────────────────────────

test('synonym rungs are tried before any term is dropped', () => {
  const { expansions } = expandQuery('broken charger');
  const ladder = relaxationLadder('broken charger', expansions);
  assert.equal(ladder[0], 'damaged charger');
  assert.ok(ladder.indexOf('damaged charger') < ladder.indexOf('charger'));
});

test('a single token still gets its synonym rung even though nothing can be dropped', () => {
  const { expansions } = expandQuery('rma');
  assert.deepEqual(relaxationLadder('rma', expansions), ['return']);
});

test('a two-word query tries BOTH single-word rungs, not just one', () => {
  // Regression: the ladder used to shed cumulatively, so "bose zzzqqq" dropped
  // the lower-scoring "bose", tried "zzzqqq", and gave up — never trying "bose",
  // the rung that had the answer. Caught end-to-end against the dev server.
  const ladder = relaxationLadder('bose zzzqqq');
  assert.ok(ladder.includes('bose'), 'must try dropping the garbage token');
  assert.ok(ladder.includes('zzzqqq'), 'must also try dropping the other one');
});

test('an identity fragment is not dropped while an ordinary word can go instead', () => {
  const ladder = relaxationLadder('dell cf7400x charger');
  assert.ok(
    ladder.every((rung) => rung.includes('cf7400x')),
    'the model number is the reason for the search',
  );
});

test('when every token is identity-shaped they all become droppable', () => {
  // Nothing to protect them from — refusing to relax at all would just be a
  // dead end with extra steps.
  assert.ok(relaxationLadder('cf7400x ab12cd').length > 0);
});
