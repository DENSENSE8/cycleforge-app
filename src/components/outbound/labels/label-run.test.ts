import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceLabelRun,
  labelRunPosition,
  pruneLabelRun,
  startLabelRun,
} from './label-run';

test('startLabelRun: first selected row is active, display order kept', () => {
  const run = startLabelRun([7, 3, 9]);
  assert.ok(run);
  assert.deepEqual(run.queue, [7, 3, 9]);
  assert.equal(run.activeId, 7);
});

test('startLabelRun: empty selection starts nothing', () => {
  assert.equal(startLabelRun([]), null);
});

test('startLabelRun: duplicate ids collapse to one visit', () => {
  const run = startLabelRun([5, 5, 8]);
  assert.ok(run);
  assert.deepEqual(run.queue, [5, 8]);
});

test('advanceLabelRun: walks the queue in order and finishes with null', () => {
  let run = startLabelRun([1, 2, 3]);
  assert.ok(run);
  run = advanceLabelRun(run);
  assert.equal(run?.activeId, 2);
  run = advanceLabelRun(run!);
  assert.equal(run?.activeId, 3);
  assert.equal(advanceLabelRun(run!), null); // last row done → run over
});

test('advanceLabelRun: active id missing from queue resumes from the top', () => {
  const next = advanceLabelRun({ queue: [4, 6], activeId: 99 });
  assert.equal(next?.activeId, 4);
});

test('pruneLabelRun: surviving active row keeps its place, queue shrinks', () => {
  const run = { queue: [1, 2, 3] as const, activeId: 2 };
  const pruned = pruneLabelRun(run, new Set([2, 3]));
  assert.deepEqual(pruned?.queue, [2, 3]);
  assert.equal(pruned?.activeId, 2);
});

test('pruneLabelRun: identity preserved when nothing changed', () => {
  const run = { queue: [1, 2] as const, activeId: 1 };
  assert.equal(pruneLabelRun(run, new Set([1, 2])), run);
});

test('pruneLabelRun: vanished active row advances to the NEXT survivor, not the top', () => {
  const run = { queue: [1, 2, 3, 4] as const, activeId: 2 };
  const pruned = pruneLabelRun(run, new Set([1, 4]));
  assert.equal(pruned?.activeId, 4); // 3 is gone too — next survivor after 2
  assert.deepEqual(pruned?.queue, [1, 4]);
});

test('pruneLabelRun: vanished active row with no survivor after it ends the run', () => {
  const run = { queue: [1, 2, 3] as const, activeId: 3 };
  assert.equal(pruneLabelRun(run, new Set([1, 2])), null);
});

test('pruneLabelRun: nothing left ends the run', () => {
  const run = { queue: [1, 2] as const, activeId: 1 };
  assert.equal(pruneLabelRun(run, new Set<number>()), null);
});

test('labelRunPosition: 1-based k of n for the band caption', () => {
  assert.deepEqual(labelRunPosition({ queue: [9, 8, 7], activeId: 8 }), {
    index: 2,
    total: 3,
  });
  assert.deepEqual(labelRunPosition({ queue: [9], activeId: 42 }), {
    index: 1,
    total: 1,
  });
});
