/** DB-free unit tests for order-note @mention tokens. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeMentionQuery,
  decodeNoteMentions,
  encodeNoteMentions,
  formatNoteMention,
  parseNoteMentions,
  splitNoteMentions,
} from './note-mentions';

test('parseNoteMentions returns distinct ids in first-seen order', () => {
  const text = 'hey @[Ana](staff:7) and @[Bo Li](staff:3), also @[Ana](staff:7)';
  assert.deepEqual(parseNoteMentions(text), [7, 3]);
});

test('parseNoteMentions ignores plain @names, malformed and zero ids', () => {
  assert.deepEqual(parseNoteMentions('@Ana look at this'), []);
  assert.deepEqual(parseNoteMentions('@[Ana](staff:)'), []);
  assert.deepEqual(parseNoteMentions('@[Ana](staff:abc)'), []);
  assert.deepEqual(parseNoteMentions('@[Ana](staff:0)'), []);
  assert.deepEqual(parseNoteMentions('@[](staff:4)'), []);
  assert.deepEqual(parseNoteMentions('email a@b.com'), []);
});

test('formatNoteMention round-trips through the parser even with hostile names', () => {
  const token = formatNoteMention('We](ird (name', 12);
  assert.deepEqual(parseNoteMentions(`x ${token} y`), [12]);
});

test('splitNoteMentions keeps surrounding text', () => {
  assert.deepEqual(splitNoteMentions('a @[Ana](staff:7) b'), [
    { kind: 'text', text: 'a ' },
    { kind: 'mention', name: 'Ana', staffId: 7 },
    { kind: 'text', text: ' b' },
  ]);
});

test('decode → encode round-trips the stored text', () => {
  const stored = 'ping @[Ana Maria](staff:7) and @[Bo](staff:3) re box';
  const { display, picked } = decodeNoteMentions(stored);
  assert.equal(display, 'ping @Ana Maria and @Bo re box');
  assert.equal(encodeNoteMentions(display, picked), stored);
});

test('encodeNoteMentions drops picks the operator deleted and prefers longer names', () => {
  const picked = [
    { staffId: 1, name: 'Ana' },
    { staffId: 2, name: 'Ana Maria' },
    { staffId: 3, name: 'Bo' },
  ];
  assert.equal(
    encodeNoteMentions('@Ana Maria, @Ana, @Bob, mail@Bo', picked),
    '@[Ana Maria](staff:2), @[Ana](staff:1), @Bob, mail@Bo',
  );
  assert.deepEqual(parseNoteMentions(encodeNoteMentions('hi', picked)), []);
});

test('activeMentionQuery finds the @query under the caret only at a word start', () => {
  assert.deepEqual(activeMentionQuery('hey @an', 7), { start: 4, query: 'an' });
  assert.deepEqual(activeMentionQuery('@', 1), { start: 0, query: '' });
  assert.equal(activeMentionQuery('mail@an', 7), null);
  assert.equal(activeMentionQuery('hey @an\nx', 9), null);
  assert.equal(activeMentionQuery('no mention', 10), null);
});
