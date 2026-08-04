/**
 * The nav matcher's contract. These are the assertions that make ranking a
 * property of the module rather than something you eyeball in a rendered list.
 *
 * Run: node --test --import tsx src/lib/nav/nav-search.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  matchNavItem,
  matchNavToken,
  searchNav,
  splitNavHighlight,
  type NavSearchable,
} from './nav-search';

const page = (label: string, keywords?: string[]): NavSearchable => ({ label, keywords });

const labels = (items: readonly NavSearchable[], query: string) =>
  searchNav(items, query).map((r) => r.item.label);

test('the tier ladder, weakest to strongest', () => {
  assert.equal(matchNavToken('Labels', 'labels')?.tier, 'exact');
  assert.equal(matchNavToken('Labels', 'lab')?.tier, 'prefix');
  assert.equal(matchNavToken('Print Labels', 'lab')?.tier, 'word-prefix');
  assert.equal(matchNavToken('Labels', 'abel')?.tier, 'substring');
  assert.equal(matchNavToken('Print Labels', 'prlb')?.tier, 'subsequence');
  assert.equal(matchNavToken('Labels', 'zzz'), null);
});

test('a stronger tier always outranks a weaker one, whatever the bonuses', () => {
  const items = [page('Abel Reports'), page('Print Labels'), page('Labels')];
  // exact > word-prefix > substring — and NOT registry order.
  assert.deepEqual(labels(items, 'labels'), ['Labels', 'Print Labels']);
});

test('the screenshot case: an exact page name ranks first', () => {
  // Typing a page's name must return that page, not the category holding it.
  const items = [page('Inbound'), page('Incoming photo sync'), page('Incoming')];
  assert.deepEqual(labels(items, 'incoming'), ['Incoming', 'Incoming photo sync']);
});

test('multi-token queries are AND, across label and keywords', () => {
  const items = [
    page('Labels', ['Print Stations', '/print/labels']),
    page('Labels', ['Fulfillment', '/shipping/labels']),
    page('Ready', ['Fulfillment', '/shipping/fba']),
  ];
  // Both tokens must land somewhere; "print" only does on the first row.
  assert.equal(searchNav(items, 'print labels').length, 1);
  assert.equal(searchNav(items, 'fulfillment labels').length, 1);
  // A token that matches nothing disqualifies the row entirely.
  assert.equal(searchNav(items, 'labels nowhere').length, 0);
});

test('a row is only as good as its weakest token', () => {
  const item = page('Print Labels');
  // "print" is a prefix, "lb" is a subsequence → the row reports subsequence.
  assert.equal(matchNavItem(item, 'print lb')?.tier, 'subsequence');
  assert.equal(matchNavItem(item, 'print lab')?.tier, 'word-prefix');
});

test('a label match outranks a keyword match of the same or stronger tier', () => {
  // "qc" is EXACT on the second row's hidden alias but only a prefix on the
  // first row's visible label. The visible one wins — a row that floats to the
  // top with nothing highlighted is unexplainable to the operator.
  const items = [page('QC Checklist'), page('Quality', ['qc'])];
  assert.deepEqual(labels(items, 'qc'), ['QC Checklist', 'Quality']);
});

test('a keyword match still beats a much weaker label match', () => {
  // Exact alias vs. a fuzzy subsequence guess: the alias is better evidence.
  const items = [page('Purchase Ledger Groups'), page('Inventory', ['plg'])];
  assert.deepEqual(labels(items, 'plg'), ['Inventory', 'Purchase Ledger Groups']);
});

test('single-character queries never go fuzzy', () => {
  // One letter subsequence-matches almost everything; that is noise, not a guess.
  assert.equal(matchNavToken('Print Labels', 'x'), null);
  assert.equal(matchNavToken('Print Labels', 'r')?.tier, 'substring');
});

test('ties break deterministically: shorter label, then registry order', () => {
  const items = [page('Order Review'), page('Orders'), page('Order')];
  // All three are prefix matches on "order" at the same score.
  assert.deepEqual(labels(items, 'order'), ['Order', 'Orders', 'Order Review']);

  const sameLength = [page('Alpha'), page('Alpen')];
  assert.deepEqual(labels(sameLength, 'alp'), ['Alpha', 'Alpen']);
});

test('an empty query returns everything, in registry order', () => {
  const items = [page('Zebra'), page('Alpha')];
  assert.deepEqual(labels(items, ''), ['Zebra', 'Alpha']);
  assert.deepEqual(labels(items, '   '), ['Zebra', 'Alpha']);
});

test('matching is case- and whitespace-insensitive', () => {
  const items = [page('Print Labels')];
  assert.equal(searchNav(items, 'PRINT   LABELS').length, 1);
  assert.equal(searchNav(items, '  print labels  ').length, 1);
});

test('highlight ranges mark the characters that actually matched', () => {
  const match = matchNavItem(page('Print Labels'), 'lab')!;
  assert.deepEqual(
    splitNavHighlight('Print Labels', match.ranges),
    [
      { text: 'Print ', hit: false },
      { text: 'Lab', hit: true },
      { text: 'els', hit: false },
    ],
  );
});

test('multi-token highlights merge into non-overlapping spans', () => {
  const match = matchNavItem(page('Print Labels'), 'print rint')!;
  // "print" [0,5) and "rint" [1,5) overlap — one span, not two.
  assert.deepEqual(match.ranges, [[0, 5]]);
});

test('a keyword-only match highlights nothing rather than the wrong characters', () => {
  const match = matchNavItem(page('Ready', ['/shipping/labels']), 'shipping')!;
  assert.deepEqual(match.ranges, []);
  assert.deepEqual(splitNavHighlight('Ready', match.ranges), [{ text: 'Ready', hit: false }]);
});

test('subsequence prefers the more compact alignment', () => {
  const tight = matchNavToken('Prlb Report', 'prlb')!;
  const loose = matchNavToken('Print Label Board', 'prlb')!;
  assert.ok(tight.score > loose.score, 'fewer gaps should score higher');
});
