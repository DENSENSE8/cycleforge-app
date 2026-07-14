import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activeReceivingStepKey,
  deriveReceivingStepFlags,
  deriveReceivingStepStates,
} from './derive-receiving-step-states';

const base = {
  photoCount: 0,
  serialCount: 0,
  quantityExpected: 1,
  labelPrinted: false,
};

test('fresh line: photos active, rest pending', () => {
  const states = deriveReceivingStepStates(base);
  assert.equal(states.photos, 'active');
  assert.equal(states.serial, 'pending');
  assert.equal(states.print, 'pending');
});

test('serialCount alone does not mark print done (no isComplete shortcut)', () => {
  const flags = deriveReceivingStepFlags({ ...base, serialCount: 1 });
  assert.equal(flags.serial, true);
  assert.equal(flags.print, false);
});

test('steps with passing gates show done even while an earlier step is active', () => {
  const states = deriveReceivingStepStates({
    ...base,
    serialCount: 1,
    labelPrinted: true,
  });
  assert.equal(states.photos, 'active');
  assert.equal(states.serial, 'done');
  assert.equal(states.print, 'done');
});

test('active is the FIRST failing gate; done steps after it keep their check', () => {
  const input = { ...base, photoCount: 2, serialCount: 0, labelPrinted: true };
  const states = deriveReceivingStepStates(input);
  assert.equal(states.photos, 'done');
  assert.equal(states.serial, 'active');
  assert.equal(states.print, 'done');
  assert.equal(activeReceivingStepKey(input), 'serial');
});

test('all gates pass: every step done', () => {
  const input = { ...base, photoCount: 2, serialCount: 1, labelPrinted: true };
  const states = deriveReceivingStepStates(input);
  for (const key of ['photos', 'serial', 'print'] as const) {
    assert.equal(states[key], 'done');
  }
  assert.equal(activeReceivingStepKey(input), null);
});

test('no-serial waiver completes the Serial step with zero serials captured', () => {
  const flags = deriveReceivingStepFlags({ ...base, serialCount: 0, serialAbsent: true });
  assert.equal(flags.serial, true);
});

test('waiver flips Serial from active to done; the next gap becomes active', () => {
  const withoutWaiver = deriveReceivingStepStates({ ...base, photoCount: 2, serialCount: 0 });
  assert.equal(withoutWaiver.serial, 'active');

  const withWaiver = deriveReceivingStepStates({
    ...base,
    photoCount: 2,
    serialCount: 0,
    serialAbsent: true,
  });
  assert.equal(withWaiver.serial, 'done');
  // Print is now the first failing gate → the operator's next job.
  assert.equal(withWaiver.print, 'active');
  assert.equal(activeReceivingStepKey({ ...base, photoCount: 2, serialCount: 0, serialAbsent: true }), 'print');
});

test('no scan/condition steps: the stepper is exactly Photos → Serial → Print', () => {
  const states = deriveReceivingStepStates(base);
  assert.deepEqual(Object.keys(states).sort(), ['photos', 'print', 'serial']);
  assert.equal('scan' in states, false);
  assert.equal('condition' in states, false);
});
