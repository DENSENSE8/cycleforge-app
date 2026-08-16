import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  LABEL_NOTE_PHRASES_MAX,
  LABEL_NOTE_PHRASE_MIN_LEN,
  applyRememberLabelNotePhrase,
  labelNoteGhostSuffix,
  matchLabelNotePhraseFrom,
  parseLabelNotePhrases,
  type LabelNotePhraseEntry,
} from './label-note-phrases';

function entry(phrase: string, lastUsedAt = 1): LabelNotePhraseEntry {
  return { phrase, lastUsedAt };
}

test('parseLabelNotePhrases drops junk, short rows, and case-dupes', () => {
  assert.deepEqual(parseLabelNotePhrases(null), []);
  assert.deepEqual(parseLabelNotePhrases('nope'), []);
  const parsed = parseLabelNotePhrases([
    { phrase: 'ab', lastUsedAt: 1 },
    { phrase: '  Scratch on left  ', lastUsedAt: 9 },
    { phrase: 'scratch on left', lastUsedAt: 2 },
    { phrase: 12, lastUsedAt: 3 },
    null,
    { phrase: 'Open box', lastUsedAt: 'x' },
  ]);
  assert.deepEqual(
    parsed.map((e) => e.phrase),
    ['Scratch on left', 'Open box'],
  );
  assert.equal(parsed[0]?.lastUsedAt, 9);
  assert.equal(parsed[1]?.lastUsedAt, 0);
});

test('applyRememberLabelNotePhrase rejects short, dedupes, bumps MRU, clamps cap', () => {
  assert.deepEqual(applyRememberLabelNotePhrase([], 'ab', 10), []);
  assert.equal('x'.repeat(LABEL_NOTE_PHRASE_MIN_LEN - 1).length < LABEL_NOTE_PHRASE_MIN_LEN, true);

  let list = applyRememberLabelNotePhrase([], 'Open box', 1);
  list = applyRememberLabelNotePhrase(list, 'Scratch left', 2);
  list = applyRememberLabelNotePhrase(list, 'open BOX', 3);
  assert.deepEqual(
    list.map((e) => e.phrase),
    ['open BOX', 'Scratch left'],
  );
  assert.equal(list[0]?.lastUsedAt, 3);

  const many = Array.from({ length: LABEL_NOTE_PHRASES_MAX + 5 }, (_, i) =>
    entry(`phrase ${String(i).padStart(2, '0')}`, i),
  );
  const capped = applyRememberLabelNotePhrase(many, 'brand new note', 99);
  assert.equal(capped.length, LABEL_NOTE_PHRASES_MAX);
  assert.equal(capped[0]?.phrase, 'brand new note');
});

test('matchLabelNotePhraseFrom prefixes case-insensitively and prefers extras then MRU', () => {
  const bank = [entry('Scratch on left grille', 2), entry('Scratch on right', 1)];

  assert.equal(matchLabelNotePhraseFrom(bank, ''), null);
  assert.equal(matchLabelNotePhraseFrom(bank, 'Scratch on left grille'), null);
  assert.equal(matchLabelNotePhraseFrom(bank, 'zzz'), null);

  assert.equal(matchLabelNotePhraseFrom(bank, 'scr'), 'Scratch on left grille');
  assert.equal(matchLabelNotePhraseFrom(bank, 'Scratch on r'), 'Scratch on right');

  assert.equal(
    matchLabelNotePhraseFrom(bank, 'op', ['Open box — missing remote']),
    'Open box — missing remote',
  );
  // Extra that already equals typed input is skipped; fall through to bank.
  assert.equal(matchLabelNotePhraseFrom(bank, 'scr', ['scr']), 'Scratch on left grille');
});

test('labelNoteGhostSuffix paints only the remainder', () => {
  assert.equal(labelNoteGhostSuffix('Scr', 'Scratch on left'), 'atch on left');
  assert.equal(labelNoteGhostSuffix('', 'Scratch'), 'Scratch');
  assert.equal(labelNoteGhostSuffix('Scratch', 'Scratch'), '');
  assert.equal(labelNoteGhostSuffix('Scr', null), '');
});
