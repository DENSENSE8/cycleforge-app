import assert from 'node:assert/strict';
import test from 'node:test';

import {
  expandQuery,
  isStopword,
  normalizeQuery,
  tokenizeQuery,
} from '@/lib/search/query-expansion';

// ── normalizeQuery — the grouping key ───────────────────────────────────────

test('normalizeQuery folds case and collapses whitespace', () => {
  assert.equal(normalizeQuery('  Dell   LATITUDE  7400 '), 'dell latitude 7400');
});

test('normalizeQuery strips scanner control characters', () => {
  // A wedge that emits STX … CR around the payload must group as one query,
  // not three distinct worklist rows.
  assert.equal(normalizeQuery('\x02R-1234\r\n'), 'r-1234');
});

test('normalizeQuery strips zero-width characters pasted from a web page', () => {
  assert.equal(normalizeQuery('1Z999​AA1﻿'), '1z999 aa1');
});

test('normalizeQuery of blank input is empty, not whitespace', () => {
  assert.equal(normalizeQuery('   \t  '), '');
});

// ── tokenize ────────────────────────────────────────────────────────────────

test('tokenizeQuery keeps identity punctuation inside a token', () => {
  assert.deepEqual(tokenizeQuery('r-1234 s/n abc'), ['r-1234', 's/n', 'abc']);
});

test('tokenizeQuery splits on separators and strips wrapping punctuation', () => {
  assert.deepEqual(tokenizeQuery('dell, "7400"; charger'), ['dell', '7400', 'charger']);
});

test('isStopword covers console question words, not just English filler', () => {
  assert.ok(isStopword('the'));
  assert.ok(isStopword('where'));
  assert.ok(!isStopword('dell'));
});

// ── expandQuery — the synonym ladder ────────────────────────────────────────

test('expandQuery maps operator vernacular onto schema words', () => {
  const { expansions } = expandQuery('rma 1234');
  assert.deepEqual(expansions, ['return 1234']);
});

test('expandQuery substitutes ONE token at a time, never all at once', () => {
  const { expansions } = expandQuery('broken box');
  // 'broken' → damaged | defective, 'box' → carton. Each swap is its own rung;
  // the combined "damaged carton" is deliberately absent.
  assert.deepEqual(expansions, ['damaged box', 'defective box', 'broken carton']);
});

test('expandQuery returns an empty ladder when nothing is curated', () => {
  assert.deepEqual(expandQuery('dell latitude 7400').expansions, []);
});

test('expandQuery never re-emits the original query', () => {
  const { normalized, expansions } = expandQuery('WISMO');
  assert.equal(normalized, 'wismo');
  assert.ok(!expansions.includes('wismo'));
  assert.deepEqual(expansions, ['tracking', 'shipment']);
});

test('expandQuery does not read through Object.prototype', () => {
  // A bare record lookup would hand `for…of` the Object constructor here.
  for (const hostile of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    assert.deepEqual(
      expandQuery(hostile).expansions,
      [],
      `${hostile} must not resolve to a synonym list`,
    );
  }
});
