import assert from 'node:assert/strict';
import test from 'node:test';
import { identityChipText, recordNote, recordPerson, recordPlatform } from './presets';

test('record identity facts have distinct, stable typography roles', () => {
  assert.match(identityChipText, /text-role-body/);
  assert.match(identityChipText, /font-semibold/);
  assert.match(identityChipText, /font-mono/);

  assert.match(recordPlatform, /text-role-caption/);
  assert.match(recordPlatform, /font-semibold/);

  assert.match(recordPerson, /text-role-data/);
  assert.match(recordPerson, /font-medium/);

  assert.match(recordNote, /text-role-caption/);
  assert.match(recordNote, /font-normal/);

  assert.equal(new Set([identityChipText, recordPlatform, recordPerson, recordNote]).size, 4);
});
