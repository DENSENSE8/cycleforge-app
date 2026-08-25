/**
 * The async session-write queue — DB-free, network-free, frame-free.
 *
 * Every collaborator is injected: the transport is a fake `queueOrFetch`, the
 * animation frame is a manual pump, and the yield is a resolved promise. What
 * is under test is the set of properties that make "enqueue and forget" safe on
 * a warehouse floor:
 *
 *   • the scan path never awaits, and never sees an error;
 *   • a failing write does not fail the scan;
 *   • a replay is a no-op that returns the original result;
 *   • a burst produces ONE counter update;
 *   • an offline scan queues and drains on reconnect.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSessionWriteQueue } from './session-write-queue';
import type { ScanWrite, SessionCounterDelta } from './scan-write-order';

const T = (ms: number) => new Date(Date.parse('2026-08-22T09:00:00.000Z') + ms).toISOString();

function write(over: Partial<ScanWrite> & { clientEventId: string }): ScanWrite {
  return {
    occurredAt: T(0),
    sessionId: 1,
    sessionType: 'unbox',
    value: 'BARCODE',
    surfaceKey: 'unbox',
    deviceId: 'bench-3',
    ...over,
  };
}

interface Posted {
  url: string;
  idempotencyKey: string;
  body: ScanWrite;
}

/**
 * A server stand-in that claim-or-replays on the idempotency key, the way
 * `/api/sessions/[id]/scans` does. `fail` makes the next N posts 5xx.
 */
function transport(opts: { failTimes?: number; offline?: boolean } = {}) {
  const posted: Posted[] = [];
  const seen = new Map<string, unknown>();
  let failures = opts.failTimes ?? 0;
  let offline = opts.offline ?? false;
  const queued: Posted[] = [];

  const post: Parameters<typeof createSessionWriteQueue>[0]['post'] = async (input) => {
    const key = input.headers['Idempotency-Key'];
    const body = JSON.parse(input.body) as ScanWrite;
    const record = { url: input.url, idempotencyKey: key, body };

    if (offline) {
      // What queueOrFetch does when there is no signal: persist and hand back a
      // synthetic 202 so the caller's success path runs.
      queued.push(record);
      return new Response(JSON.stringify({ queued: true }), { status: 202 });
    }
    if (failures > 0) {
      failures -= 1;
      return new Response('boom', { status: 503 });
    }

    posted.push(record);
    if (seen.has(key)) {
      // The replay branch: the original result, not a second write.
      return new Response(JSON.stringify({ ...(seen.get(key) as object), replayed: true }), {
        status: 200,
      });
    }
    const result = { recorded: true, clientEventId: key };
    seen.set(key, result);
    return new Response(JSON.stringify(result), { status: 200 });
  };

  return {
    post,
    posted,
    /** Distinct writes the server actually accepted (replays excluded). */
    accepted: () => seen.size,
    reconnect: async () => {
      offline = false;
      const draining = [...queued];
      queued.length = 0;
      for (const record of draining) {
        await post({
          url: record.url,
          method: 'POST',
          headers: { 'Idempotency-Key': record.idempotencyKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(record.body),
        });
      }
    },
    queuedCount: () => queued.length,
  };
}

/** A manual animation-frame pump — no browser, no timers, no flake. */
function framePump() {
  const callbacks: FrameRequestCallback[] = [];
  return {
    raf: (cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return callbacks.length;
    },
    caf: () => {},
    tick: () => {
      const batch = callbacks.splice(0, callbacks.length);
      for (const cb of batch) cb(0);
    },
    scheduled: () => callbacks.length,
  };
}

const noYield = async () => {};

test('enqueue is synchronous, returns nothing, and never throws', async () => {
  const t = transport();
  const frames = framePump();
  const q = createSessionWriteQueue({ post: t.post, raf: frames.raf, caf: frames.caf, yieldToInput: noYield });

  const returned = q.enqueue(write({ clientEventId: 'a' }));
  assert.equal(returned, undefined, 'nothing to await on the scan path');
  assert.equal(q.stats().pending, 1, 'and the write is already queued');

  await q.flush();
  assert.equal(t.posted.length, 1);
  q.dispose();
});

test('a session write failing does NOT fail the scan', async () => {
  // Every post 5xxs, forever.
  const t = transport({ failTimes: 999 });
  const frames = framePump();
  const q = createSessionWriteQueue({ post: t.post, raf: frames.raf, caf: frames.caf, yieldToInput: noYield });

  q.enqueue(write({ clientEventId: 'a' }));
  // Drain until the attempt budget is spent. No throw, no rejection.
  for (let i = 0; i < 5; i += 1) await q.flush();

  assert.equal(t.posted.length, 0, 'nothing landed');
  assert.equal(q.stats().dropped, 1, 'and the gap is COUNTED, not silent');
  assert.equal(q.stats().pending, 0);
  q.dispose();
});

test('a replayed clientEventId is a no-op that returns the original result', async () => {
  const t = transport();
  const frames = framePump();
  const q = createSessionWriteQueue({ post: t.post, raf: frames.raf, caf: frames.caf, yieldToInput: noYield });

  q.enqueue(write({ clientEventId: 'same', value: 'FIRST' }));
  await q.flush();
  // A retry of the SAME operator action — same key, as the wedge minted it.
  q.enqueue(write({ clientEventId: 'same', value: 'FIRST' }));
  await q.flush();

  assert.equal(t.accepted(), 1, 'the server recorded ONE scan');
  assert.equal(t.posted.length, 2, 'even though two requests reached it');
  q.dispose();
});

test('a burst of 50 scans produces ONE coalesced counter update, not 50', async () => {
  const t = transport();
  const frames = framePump();
  const updates: SessionCounterDelta[][] = [];

  const q = createSessionWriteQueue({
    post: t.post,
    raf: frames.raf,
    caf: frames.caf,
    yieldToInput: noYield,
    onCounters: (deltas) => updates.push(deltas),
  });

  // The whole burst lands inside one frame, as a PO receive does.
  for (let i = 0; i < 50; i += 1) {
    q.enqueue(write({ clientEventId: `ce-${i}`, occurredAt: T(i * 20), value: `UNIT-${i}` }));
  }
  assert.equal(updates.length, 0, 'nothing applied before the frame');

  frames.tick();

  assert.equal(updates.length, 1, 'ONE apply — never one setState per scan');
  assert.equal(updates[0].length, 1, 'one session');
  assert.equal(updates[0][0].scans, 50);
  assert.equal(updates[0][0].lastValue, 'UNIT-49');

  await q.flush();
  q.dispose();
});

test('the counter update is immediate — it does not wait for the server', async () => {
  // Every post fails; the operator's count must still be right.
  const t = transport({ failTimes: 999 });
  const frames = framePump();
  const updates: SessionCounterDelta[][] = [];
  const q = createSessionWriteQueue({
    post: t.post, raf: frames.raf, caf: frames.caf, yieldToInput: noYield,
    onCounters: (deltas) => updates.push(deltas),
  });

  q.enqueue(write({ clientEventId: 'a' }));
  q.enqueue(write({ clientEventId: 'b' }));
  frames.tick();

  assert.equal(updates[0][0].scans, 2, 'the readout is optimistic, like the hit marker');
  q.dispose();
});

test('an offline scan queues and drains correctly on reconnect', async () => {
  const t = transport({ offline: true });
  const frames = framePump();
  const q = createSessionWriteQueue({ post: t.post, raf: frames.raf, caf: frames.caf, yieldToInput: noYield });

  q.enqueue(write({ clientEventId: 'off-1', value: 'A' }));
  q.enqueue(write({ clientEventId: 'off-2', value: 'B' }));
  await q.flush();

  // A 202 is success from the queue's point of view — the offline store owns
  // them now, so nothing is left pending client-side.
  assert.equal(q.stats().pending, 0);
  assert.equal(q.stats().sent, 2);
  assert.equal(t.accepted(), 0, 'nothing reached the server yet');
  assert.equal(t.queuedCount(), 2);

  await t.reconnect();

  assert.equal(t.accepted(), 2, 'both landed, under their original keys');
  assert.deepEqual(t.posted.map((p) => p.body.value), ['A', 'B']);
  q.dispose();
});

test('a 4xx is deterministic — it is not retried forever', async () => {
  const frames = framePump();
  let calls = 0;
  const q = createSessionWriteQueue({
    raf: frames.raf,
    caf: frames.caf,
    yieldToInput: noYield,
    post: async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: 'SESSION_ID_MISMATCH' }), { status: 400 });
    },
  });

  q.enqueue(write({ clientEventId: 'bad' }));
  await q.flush();
  await q.flush();

  assert.equal(calls, 1, 'retrying a deterministic rejection only repeats the answer');
  assert.equal(q.stats().pending, 0);
  q.dispose();
});

test('a re-queued write falls back into SCAN order, not onto the end of the line', async () => {
  // First post 503s; the write is re-queued while later scans arrive.
  const t = transport({ failTimes: 1 });
  const frames = framePump();
  const q = createSessionWriteQueue({ post: t.post, raf: frames.raf, caf: frames.caf, yieldToInput: noYield });

  q.enqueue(write({ clientEventId: 'ce-0', occurredAt: T(0), value: 'FIRST' }));
  await q.flush();                       // fails, re-queued
  q.enqueue(write({ clientEventId: 'ce-1', occurredAt: T(40), value: 'SECOND' }));
  await q.flush();

  assert.deepEqual(t.posted.map((p) => p.body.value), ['FIRST', 'SECOND']);
  q.dispose();
});

test('the endpoint is per-session, and the idempotency key is the clientEventId', async () => {
  const t = transport();
  const frames = framePump();
  const q = createSessionWriteQueue({ post: t.post, raf: frames.raf, caf: frames.caf, yieldToInput: noYield });

  q.enqueue(write({ clientEventId: 'ce-9', sessionId: 42 }));
  await q.flush();

  assert.equal(t.posted[0].url, '/api/sessions/42/scans');
  assert.equal(t.posted[0].idempotencyKey, 'ce-9');
  q.dispose();
});

test('dispose stops the queue dead — no writes after unmount', async () => {
  const t = transport();
  const frames = framePump();
  const q = createSessionWriteQueue({ post: t.post, raf: frames.raf, caf: frames.caf, yieldToInput: noYield });

  q.dispose();
  q.enqueue(write({ clientEventId: 'after-dispose' }));
  await q.flush();

  assert.equal(t.posted.length, 0);
});
