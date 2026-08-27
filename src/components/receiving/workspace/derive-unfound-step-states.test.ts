import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UNFOUND_WORKFLOW_STEPS,
  deriveUnfoundStepStates,
  type DeriveUnfoundStepStatesInput,
} from './derive-unfound-step-states';

/** Fully-satisfied matched gates so tests vary only the axis under test. */
const DONE_CAPTURE = {
  photoCount: 2,
  serialCount: 1,
  quantityExpected: 1,
  labelPrinted: true,
} satisfies Omit<DeriveUnfoundStepStatesInput, 'classified'>;

test('unfound steps = Classify prepended to the matched Photos→Serial→Print', () => {
  assert.deepEqual(
    UNFOUND_WORKFLOW_STEPS.map((s) => s.key),
    ['classify', 'photos', 'serial', 'print'],
  );
});

test('fresh unfound carton: Classify is the active "you are here" dot, rest pending', () => {
  const states = deriveUnfoundStepStates({
    photoCount: 0,
    serialCount: 0,
    quantityExpected: 1,
    labelPrinted: false,
    classified: false,
  });
  assert.equal(states.classify, 'active');
  assert.equal(states.photos, 'pending');
  assert.equal(states.serial, 'pending');
  assert.equal(states.print, 'pending');
});

test('classified but nothing captured: Classify done, Photos becomes active', () => {
  const states = deriveUnfoundStepStates({
    photoCount: 0,
    serialCount: 0,
    quantityExpected: 1,
    labelPrinted: false,
    classified: true,
  });
  assert.equal(states.classify, 'done');
  assert.equal(states.photos, 'active');
  assert.equal(states.serial, 'pending');
});

test('completeness checklist, not a wizard: a photo shot before classifying still reads Photos ✓', () => {
  const states = deriveUnfoundStepStates({
    photoCount: 3,
    serialCount: 0,
    quantityExpected: 1,
    labelPrinted: false,
    classified: false,
  });
  // Classify still holds the active marker (first incomplete), but Photos is not
  // masked behind it — its own gate passed, so it reads done.
  assert.equal(states.classify, 'active');
  assert.equal(states.photos, 'done');
  assert.equal(states.serial, 'pending');
});

test('serialAbsent waiver completes the Serial step just like a captured serial', () => {
  const states = deriveUnfoundStepStates({
    photoCount: 1,
    serialCount: 0,
    quantityExpected: 1,
    labelPrinted: false,
    classified: true,
    serialAbsent: true,
  });
  assert.equal(states.serial, 'done');
  assert.equal(states.print, 'active');
});

test('all gates satisfied: every unfound step reads done', () => {
  const states = deriveUnfoundStepStates({ ...DONE_CAPTURE, classified: true });
  assert.deepEqual(states, { classify: 'done', photos: 'done', serial: 'done', print: 'done' });
});
