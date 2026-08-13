/**
 *   npx tsx --test src/lib/perf/stream-apply.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyStreamBudget,
  isSyncControlEvent,
  STREAM_APPLY_BATCH_SIZE,
  STREAM_APPLY_TIME_BUDGET_MS,
} from './stream-apply';

describe('isSyncControlEvent', () => {
  it('treats phase / result / error as control and everything else as a row', () => {
    assert.equal(isSyncControlEvent({ type: 'phase' }), true);
    assert.equal(isSyncControlEvent({ type: 'result' }), true);
    assert.equal(isSyncControlEvent({ type: 'error' }), true);
    assert.equal(isSyncControlEvent({ type: 'exception' }), false);
    assert.equal(isSyncControlEvent({ type: 'detail' }), false);
  });
});

describe('applyStreamBudget', () => {
  it('batches row events and flushes a control event as its own paint', async () => {
    const paints: string[][] = [];
    const yields: number[] = [];
    const events = [
      { type: 'exception', id: 'a' },
      { type: 'exception', id: 'b' },
      { type: 'exception', id: 'c' },
      { type: 'phase', id: 'p1' },
      { type: 'exception', id: 'd' },
      { type: 'result', id: 'r' },
    ];

    await applyStreamBudget(events, {
      batchSize: 2,
      timeBudgetMs: 10_000,
      now: () => 0,
      yieldToInput: async () => {
        yields.push(paints.length);
      },
      apply: (batch) => {
        paints.push(batch.map((e) => String((e as { id?: string }).id ?? e.type)));
      },
    });

    assert.deepEqual(paints, [['a', 'b'], ['c'], ['p1'], ['d'], ['r']]);
    assert.ok(yields.length >= 2, 'yields between row windows and after control events');
    assert.ok(STREAM_APPLY_BATCH_SIZE >= 8);
    assert.ok(STREAM_APPLY_TIME_BUDGET_MS > 0 && STREAM_APPLY_TIME_BUDGET_MS < 16);
  });

  it('does not collapse orthogonal row payloads — SCANNED + PROBLEM stay distinct', async () => {
    const rows: Array<{ id: string; flags: string[] }> = [];
    await applyStreamBudget(
      [
        { type: 'exception', id: 'line-1', flags: ['SCANNED', 'PROBLEM'] },
        { type: 'exception', id: 'line-2', flags: ['SCANNED'] },
      ],
      {
        batchSize: 16,
        yieldToInput: async () => undefined,
        apply: (batch) => {
          for (const event of batch) {
            rows.push({
              id: (event as { id: string }).id,
              flags: (event as { flags: string[] }).flags,
            });
          }
        },
      },
    );
    assert.deepEqual(rows, [
      { id: 'line-1', flags: ['SCANNED', 'PROBLEM'] },
      { id: 'line-2', flags: ['SCANNED'] },
    ]);
  });
});
