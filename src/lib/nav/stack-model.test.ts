/**
 * Unit tests for the desk Stack fold.
 *   npx tsx --test src/lib/nav/stack-model.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  armedBlock,
  resumeBlock,
  stackModel,
  type StackBlockInput,
  type StackModelInput,
} from './stack-model';

const NOW = '2026-09-04T15:00:00.000Z';
const MINUTE = 60_000;

function block(
  id: string,
  intervals: StackBlockInput['intervals'],
  state = 'open',
): StackBlockInput {
  return { id, title: `Block ${id}`, state, intervals };
}

function input(over: Partial<StackModelInput> = {}): StackModelInput {
  return { armed: null, earlier: [], queues: [], now: NOW, ...over };
}

test('bands are always the four, in order, even when the shift is empty', () => {
  const model = stackModel(input());
  assert.deepEqual(
    model.bands.map((band) => band.kind),
    ['now', 'earlier', 'queues', 'find'],
  );
  assert.deepEqual(model.bands, [
    { kind: 'now', block: null },
    { kind: 'earlier', blocks: [] },
    { kind: 'queues', queues: [] },
    { kind: 'find' },
  ]);
});

test('bands keep their order with every band populated', () => {
  const model = stackModel(
    input({
      armed: block('a', [{ startedAt: '2026-09-04T14:30:00.000Z', endedAt: null }]),
      earlier: [block('b', [{ startedAt: '2026-09-04T09:00:00.000Z', endedAt: '2026-09-04T09:30:00.000Z' }])],
      queues: [{ id: 'to-ship', label: 'To ship', tableId: 'to-ship' }],
    }),
  );
  assert.deepEqual(
    model.bands.map((band) => band.kind),
    ['now', 'earlier', 'queues', 'find'],
  );
  assert.equal(model.bands[0].block?.id, 'a');
  assert.deepEqual(
    model.bands[1].blocks.map((b) => b.id),
    ['b'],
  );
  assert.deepEqual(model.bands[2].queues, [
    { id: 'to-ship', label: 'To ship', tableId: 'to-ship' },
  ]);
  assert.deepEqual(model.bands[3], { kind: 'find' });
});

test('elapsed sums the intervals across a parked gap, not the wall clock', () => {
  const model = stackModel(
    input({
      armed: block('a', [
        // 30m worked, then parked for four hours, then 15m more still running.
        { startedAt: '2026-09-04T09:00:00.000Z', endedAt: '2026-09-04T09:30:00.000Z' },
        { startedAt: '2026-09-04T14:45:00.000Z', endedAt: null },
      ]),
    }),
  );
  const now = armedBlock(model);
  assert.equal(now?.elapsedMs, 45 * MINUTE);
  assert.equal(now?.running, true);
  assert.equal(now?.lastStartedAt, '2026-09-04T14:45:00.000Z');
});

test('a closed block stops at its own end, and elapsed ignores the gap length', () => {
  const model = stackModel(
    input({
      earlier: [
        block('b', [
          { startedAt: '2026-09-04T08:00:00.000Z', endedAt: '2026-09-04T08:10:00.000Z' },
          { startedAt: '2026-09-04T12:00:00.000Z', endedAt: '2026-09-04T12:05:00.000Z' },
        ]),
      ],
    }),
  );
  const [first] = model.bands[1].blocks;
  assert.equal(first?.elapsedMs, 15 * MINUTE);
  assert.equal(first?.running, false);
});

test('earlier is newest-first by last interval start; no-interval blocks sink', () => {
  const model = stackModel(
    input({
      earlier: [
        block('morning', [{ startedAt: '2026-09-04T08:00:00.000Z', endedAt: '2026-09-04T08:30:00.000Z' }]),
        block('never', []),
        block('afternoon', [
          { startedAt: '2026-09-04T07:00:00.000Z', endedAt: '2026-09-04T07:30:00.000Z' },
          { startedAt: '2026-09-04T13:00:00.000Z', endedAt: '2026-09-04T13:30:00.000Z' },
        ]),
        block('midday', [{ startedAt: '2026-09-04T11:00:00.000Z', endedAt: '2026-09-04T11:30:00.000Z' }]),
      ],
    }),
  );
  assert.deepEqual(
    model.bands[1].blocks.map((b) => b.id),
    ['afternoon', 'midday', 'morning', 'never'],
  );
});

test('resume parks the block that held the desk', () => {
  const model = stackModel(
    input({
      armed: block('a', [{ startedAt: '2026-09-04T14:00:00.000Z', endedAt: null }]),
      earlier: [block('b', [{ startedAt: '2026-09-04T09:00:00.000Z', endedAt: '2026-09-04T09:30:00.000Z' }])],
    }),
  );
  assert.deepEqual(resumeBlock(model, 'b'), { arm: 'b', park: 'a' });
});

test('resume on an empty desk parks nothing, and re-arming the current block is a no-op', () => {
  assert.deepEqual(resumeBlock(stackModel(input()), 'b'), { arm: 'b', park: null });

  const armedModel = stackModel(
    input({ armed: block('a', [{ startedAt: '2026-09-04T14:00:00.000Z', endedAt: null }]) }),
  );
  assert.deepEqual(resumeBlock(armedModel, 'a'), { arm: 'a', park: null });
});
