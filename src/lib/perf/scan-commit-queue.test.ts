/**
 *   npx tsx --test src/lib/perf/scan-commit-queue.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createScanCommitQueue } from './scan-commit-queue';

describe('createScanCommitQueue', () => {
  it('enqueue is sync and does not call onScan until after the yield', async () => {
    const scanned: string[] = [];
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const queue = createScanCommitQueue({
      onScan: (value) => scanned.push(value),
      yieldToInput: () => gate,
    });

    queue.enqueue('  TRACK-1  ');
    queue.enqueue('TRACK-2');
    assert.equal(queue.pendingCount(), 2);
    assert.deepEqual(scanned, [], 'onScan must not run on the enqueue stack');

    release?.();
    await queue.flush();
    assert.deepEqual(scanned, ['TRACK-1', 'TRACK-2']);
    assert.equal(queue.pendingCount(), 0);
  });

  it('drops blank payloads and keeps draining after an onScan throw', async () => {
    const scanned: string[] = [];
    const queue = createScanCommitQueue({
      onScan: (value) => {
        if (value === 'BOOM') throw new Error('handler blew up');
        scanned.push(value);
      },
      yieldToInput: async () => undefined,
    });

    queue.enqueue('   ');
    queue.enqueue('BOOM');
    queue.enqueue('OK');
    await queue.flush();
    assert.deepEqual(scanned, ['OK']);
  });
});
