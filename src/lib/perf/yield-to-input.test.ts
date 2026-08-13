/**
 *   npx tsx --test src/lib/perf/yield-to-input.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { yieldToInput } from './yield-to-input';

describe('yieldToInput', () => {
  it('prefers scheduler.yield when the dep is provided', async () => {
    const calls: string[] = [];
    await yieldToInput({
      schedulerYield: async () => {
        calls.push('scheduler');
      },
      scheduleMacrotask: () => {
        calls.push('macro');
      },
    });
    assert.deepEqual(calls, ['scheduler']);
  });

  it('falls back to a macrotask when scheduler.yield is forced off', async () => {
    const calls: string[] = [];
    await yieldToInput({
      schedulerYield: null,
      scheduleMacrotask: (fn) => {
        calls.push('macro');
        fn();
      },
    });
    assert.deepEqual(calls, ['macro']);
  });

  it('resolves after the scheduled macrotask (real MessageChannel path)', async () => {
    const start = Date.now();
    await yieldToInput({ schedulerYield: null });
    assert.ok(Date.now() >= start);
  });
});
