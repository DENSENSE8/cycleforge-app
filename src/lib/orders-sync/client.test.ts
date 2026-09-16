/**
 *   npx tsx --test src/lib/orders-sync/client.test.ts
 *
 * Drives the shipped `streamNdjson` entry point with a fake fetch +
 * ReadableStream. Proves batching + yield, not a reimplemented parser.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { streamNdjson } from './client';

function ndjsonResponse(lines: string[], status = 200): Response {
  const body = lines.join('\n');
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
  });
}

describe('streamNdjson — shipped client', () => {
  it('yields between batches and paints onBatch once per window', async () => {
    const batches: Array<Array<{ type: string; id?: string }>> = [];
    const yields: number[] = [];
    const lines = [
      JSON.stringify({ type: 'exception', id: 'a' }),
      JSON.stringify({ type: 'exception', id: 'b' }),
      JSON.stringify({ type: 'exception', id: 'c' }),
      JSON.stringify({ type: 'phase', phase: 'done' }),
      JSON.stringify({ type: 'result', result: { ok: true } }),
    ];

    await streamNdjson<{ type: string; id?: string; phase?: string; result?: unknown }>(
      '/api/orders-exceptions/sync',
      { method: 'POST' },
      {
        batchSize: 2,
        fetch: async () => ndjsonResponse(lines),
        yieldToInput: async () => {
          yields.push(batches.length);
        },
        onBatch: (events) => {
          batches.push(events.map((e) => ({ type: e.type, id: e.id })));
        },
      },
    );

    const painted = batches.flat();
    assert.equal(painted.filter((e) => e.type === 'exception').length, 3);
    assert.ok(painted.some((e) => e.type === 'phase'));
    assert.ok(painted.some((e) => e.type === 'result'));
    assert.ok(yields.length >= 1, 'must yield so a wedge scan can land mid-stream');
    assert.ok(
      batches.length < lines.length,
      'onBatch must coalesce — a 5-line stream is not 5 React paints',
    );
  });

  it('legacy onEvent callback still receives every parsed line', async () => {
    const seen: string[] = [];
    await streamNdjson<{ type: string }>(
      '/api/x',
      {},
      {
        fetch: async () =>
          ndjsonResponse([
            JSON.stringify({ type: 'phase' }),
            JSON.stringify({ type: 'exception' }),
          ]),
        yieldToInput: async () => undefined,
        onEvent: (event) => seen.push(event.type),
      },
    );
    assert.deepEqual(seen, ['phase', 'exception']);
  });

  it('HTTP failures become a single error event (no throw)', async () => {
    const seen: Array<{ type: string; error?: string }> = [];
    await streamNdjson('/api/x', {}, {
      fetch: async () => new Response('nope', { status: 500 }),
      onEvent: (event) => seen.push(event as { type: string; error?: string }),
    });
    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.type, 'error');
    assert.match(String(seen[0]?.error), /500|nope/);
  });
});
