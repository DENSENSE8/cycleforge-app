import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDockLocation } from './dock-staging-contract';

test('normalizeDockLocation preserves scanner-safe rack identity', () => {
  assert.equal(normalizeDockLocation(' rack a / 04 '), 'RACK-A/04');
  assert.equal(normalizeDockLocation('B-04.2'), 'B-04.2');
});

test('normalizeDockLocation rejects blank and oversized values', () => {
  assert.equal(normalizeDockLocation(' '), null);
  assert.equal(normalizeDockLocation('A'), null);
  assert.equal(normalizeDockLocation('X'.repeat(65)), null);
});
