/**
 * Unit tests for Unbox flow capture-order parsing and application.
 *
 * Run: `node --import tsx --test src/lib/stations/unbox-flow-capture-order.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCaptureOrderOverride,
  parseUnboxFlowCaptureOrder,
} from './unbox-flow-capture-order';

test('applyCaptureOrderOverride: empty override is identity', () => {
  assert.deepEqual(applyCaptureOrderOverride(['a', 'b'], undefined), ['a', 'b']);
  assert.deepEqual(applyCaptureOrderOverride(['a', 'b'], []), ['a', 'b']);
});

test('applyCaptureOrderOverride: prefers override order, appends rest', () => {
  assert.deepEqual(applyCaptureOrderOverride(['a', 'b', 'c'], ['c', 'a']), ['c', 'a', 'b']);
});

test('parseUnboxFlowCaptureOrder: tolerates junk', () => {
  assert.deepEqual(parseUnboxFlowCaptureOrder(null), {});
  assert.deepEqual(parseUnboxFlowCaptureOrder('not-json'), {});
  assert.deepEqual(parseUnboxFlowCaptureOrder('[]'), {});
  assert.deepEqual(parseUnboxFlowCaptureOrder('{"found":["serial","serial","x"]}'), {
    found: ['serial', 'x'],
  });
});
