import assert from 'node:assert/strict';
import test from 'node:test';
import { keysAfterLeader } from './ChordKeys';

test('under a leader scope a row paints only the keys after the leader', () => {
  assert.deepEqual(keysAfterLeader(['C', 'S'], 'C'), ['S']);
  assert.deepEqual(keysAfterLeader(['c', 'S'], 'C'), ['S']);
});

test('a different leader, no scope, or a lone key paints the sequence as pressed', () => {
  assert.deepEqual(keysAfterLeader(['G', 'F'], 'C'), ['G', 'F']);
  assert.deepEqual(keysAfterLeader(['C', 'S'], null), ['C', 'S']);
  // A lone leader key is never erased to nothing.
  assert.deepEqual(keysAfterLeader(['C'], 'C'), ['C']);
});
