/**
 * The designation rule, exercised as a table — grammar first, then the three
 * answers a roster can give (one person, nobody, more than one).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyDesignatedTags,
  matchDesignatedStaff,
  parseDesignatedTag,
  type DesignatedStaff,
} from './designated-tag';

const MICHAEL: DesignatedStaff = { id: 1, name: 'Michael', email: null };
const THUC: DesignatedStaff = { id: 2, name: 'Thuc Nguyen', email: 'thuc.n@usav.com' };
const BACH: DesignatedStaff = { id: 16, name: 'Hoàng Lê Bách', email: null };

test('every separator the grammar accepts yields the same handle', () => {
  for (const tag of ['designated_michael', 'designated-michael', 'designated:michael']) {
    assert.equal(parseDesignatedTag(tag), 'michael', tag);
  }
});

test('the tag is case-insensitive on both halves', () => {
  assert.equal(parseDesignatedTag('DESIGNATED_Michael'), 'michael');
  assert.equal(parseDesignatedTag('  Designated-MICHAEL  '), 'michael');
});

test('a handle keeps its own separators and loses its diacritics', () => {
  assert.equal(parseDesignatedTag('designated_mary-jo'), 'mary-jo');
  assert.equal(parseDesignatedTag('designated_Hoàng'), 'hoang');
});

test('anything outside the grammar is not a designation', () => {
  for (const tag of [
    'repair_service',
    'designated',
    'designated_',
    'designated_ ',
    'undesignated_michael',
    'designation_michael',
    'designated michael',
    '',
  ]) {
    assert.equal(parseDesignatedTag(tag), null, tag);
  }
});

test('a handle matches a first name, case- and accent-folded', () => {
  assert.deepEqual(matchDesignatedStaff(['walk_in', 'designated_michael'], [MICHAEL, THUC]), {
    staffId: 1,
    tag: 'designated_michael',
  });
  assert.deepEqual(matchDesignatedStaff(['designated-bach'], [BACH]), null);
  assert.deepEqual(matchDesignatedStaff(['designated-hoang'], [MICHAEL, BACH]), {
    staffId: 16,
    tag: 'designated-hoang',
  });
});

test('a handle also matches the local-part of an email', () => {
  assert.deepEqual(matchDesignatedStaff(['designated:thuc.n'], [MICHAEL, THUC]), {
    staffId: 2,
    tag: 'designated:thuc.n',
  });
});

test('one staffer matching on BOTH axes is still one staffer', () => {
  const dual: DesignatedStaff = { id: 9, name: 'Michael Garisek', email: 'michael@usav.com' };
  assert.deepEqual(matchDesignatedStaff(['designated_michael'], [dual]), {
    staffId: 9,
    tag: 'designated_michael',
  });
});

test('two staff answering to one handle is a refusal, never a guess', () => {
  const other: DesignatedStaff = { id: 44, name: 'Michael Chen', email: null };
  assert.equal(matchDesignatedStaff(['designated_michael'], [MICHAEL, other]), null);
  assert.deepEqual(classifyDesignatedTags(['designated_michael'], [MICHAEL, other]), {
    kind: 'ambiguous',
    tags: ['designated_michael'],
  });
});

test('two tags naming two different people is the same refusal', () => {
  const verdict = classifyDesignatedTags(
    ['designated_michael', 'designated_thuc'],
    [MICHAEL, THUC],
  );
  assert.deepEqual(verdict, {
    kind: 'ambiguous',
    tags: ['designated_michael', 'designated_thuc'],
  });
});

test('a tag naming nobody does not veto a tag naming someone', () => {
  assert.deepEqual(
    classifyDesignatedTags(['designated_departed', 'designated_michael'], [MICHAEL, THUC]),
    { kind: 'matched', staffId: 1, tag: 'designated_michael' },
  );
});

test('no designated tag, and a designated tag nobody answers to, are both "none"', () => {
  assert.deepEqual(classifyDesignatedTags(['walk_in', 'repair_service'], [MICHAEL]), {
    kind: 'none',
  });
  assert.deepEqual(classifyDesignatedTags(['designated_nobody'], [MICHAEL]), { kind: 'none' });
  assert.deepEqual(classifyDesignatedTags([], [MICHAEL]), { kind: 'none' });
});

test('an empty roster designates nobody', () => {
  assert.equal(matchDesignatedStaff(['designated_michael'], []), null);
});
