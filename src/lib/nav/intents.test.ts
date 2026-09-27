import test from 'node:test';
import assert from 'node:assert/strict';
import { hasNavIntent, registerNavIntent, runNavIntent } from './intents';

test('an unowned intent does not run', () => {
  assert.equal(runNavIntent('test:unowned'), false);
  assert.equal(hasNavIntent('test:unowned'), false);
});

test('a stale unregister never removes the newer owner (remount order)', () => {
  const calls: string[] = [];
  const offFirst = registerNavIntent('test:remount', () => calls.push('first'));
  // The next mount registers before the previous one's cleanup runs.
  const offSecond = registerNavIntent('test:remount', () => calls.push('second'));
  offFirst();
  assert.equal(runNavIntent('test:remount'), true);
  assert.deepEqual(calls, ['second']);
  offSecond();
  assert.equal(hasNavIntent('test:remount'), false);
});
