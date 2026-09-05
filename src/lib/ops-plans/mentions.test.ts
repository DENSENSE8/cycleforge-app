import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mentionTokens, resolveMentions } from './mentions';

test('mentionTokens extracts unique @handles', () => {
  assert.deepEqual(mentionTokens('Ping @Lien and @Ajax, also @Lien'), ['Lien', 'Ajax']);
  assert.deepEqual(mentionTokens('no mentions here'), []);
  assert.deepEqual(mentionTokens('@Michael look at this'), ['Michael']);
});

test('resolveMentions matches prefix and first name', () => {
  const staff = [
    { id: 1, name: 'Lien Nguyen' },
    { id: 2, name: 'Ajax' },
    { id: 3, name: 'Michael Garisek' },
  ];
  assert.deepEqual(
    resolveMentions(['Lien', 'Mic'], staff).map((s) => s.id),
    [1, 3],
  );
  assert.deepEqual(resolveMentions(['nobody'], staff), []);
});
