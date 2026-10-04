import assert from 'node:assert/strict';
import test from 'node:test';
import { clampStepIndex, mobileStepCaption, mobileStepViews } from './mobile-step-progress-model';

test('only completed steps are pressable, and only when a press handler exists', () => {
  assert.deepEqual(mobileStepViews(4, 2, true), [
    { state: 'done', pressable: true },
    { state: 'done', pressable: true },
    { state: 'current', pressable: false },
    { state: 'todo', pressable: false },
  ]);
  assert.ok(mobileStepViews(4, 2, false).every((view) => !view.pressable));
});

test('the first step has nothing to jump back to', () => {
  assert.deepEqual(
    mobileStepViews(3, 0, true).map((view) => view.pressable),
    [false, false, false],
  );
});

test('an out-of-range index clamps to the step range instead of marking everything done', () => {
  assert.equal(clampStepIndex(9, 3), 2);
  assert.equal(clampStepIndex(-4, 3), 0);
  assert.equal(clampStepIndex(Number.NaN, 3), 0);
  assert.equal(clampStepIndex(0, 0), -1);
  assert.deepEqual(
    mobileStepViews(3, 9, true).map((view) => view.state),
    ['done', 'done', 'current'],
  );
});

test('the caption names the step in hand as N of M', () => {
  assert.equal(mobileStepCaption(['Upload', 'Review orders', 'Import'], 1), 'Step 2 of 3 · Review orders');
  assert.equal(mobileStepCaption([], 0), '');
});
