/**
 *   npx tsx --test src/lib/perf/coalesce-frame.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createFrameCoalescer } from './coalesce-frame';

describe('createFrameCoalescer', () => {
  it('last-wins: ten Ably invalidations in one frame become one flush', () => {
    const flushed: number[][] = [];
    let rafCb: FrameRequestCallback | null = null;
    const coalescer = createFrameCoalescer<number>({
      mode: 'last',
      raf: (cb) => {
        rafCb = cb;
        return 1;
      },
      caf: () => {
        rafCb = null;
      },
      flush: (batch) => flushed.push(batch),
    });

    for (let i = 1; i <= 10; i++) coalescer.push(i);
    assert.equal(coalescer.pendingCount(), 10);
    assert.deepEqual(flushed, [], 'must not flush on the push stack');
    assert.ok(rafCb);
    rafCb?.(0);
    assert.deepEqual(flushed, [[10]]);
    assert.equal(coalescer.pendingCount(), 0);
    coalescer.dispose();
  });

  it('all-mode delivers every payload once per frame', () => {
    const flushed: string[][] = [];
    let rafCb: FrameRequestCallback | null = null;
    const coalescer = createFrameCoalescer<string>({
      mode: 'all',
      raf: (cb) => {
        rafCb = cb;
        return 2;
      },
      caf: () => {
        rafCb = null;
      },
      flush: (batch) => flushed.push(batch),
    });
    coalescer.push('a');
    coalescer.push('b');
    coalescer.push('c');
    rafCb?.(0);
    assert.deepEqual(flushed, [['a', 'b', 'c']]);
    coalescer.dispose();
  });
});
