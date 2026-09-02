import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseIncomingIntake,
  writeIncomingIntake,
} from './incoming-intake';

test('parseIncomingIntake accepts po and return only', () => {
  assert.equal(parseIncomingIntake('po'), 'po');
  assert.equal(parseIncomingIntake('return'), 'return');
  assert.equal(parseIncomingIntake('csv'), null);
  assert.equal(parseIncomingIntake(null), null);
});

test('writeIncomingIntake round-trips', () => {
  const params = new URLSearchParams();
  writeIncomingIntake(params, 'po');
  assert.equal(params.get('intake'), 'po');
  writeIncomingIntake(params, null);
  assert.equal(params.get('intake'), null);
});
