import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { resolveActiveStep, resolveNextStepAfter } from './procedure-pointer';

const steps = [
  { key: 'arrival_check', done: true },
  { key: 'shipping_label_photo', done: false },
  { key: 'box_photo', done: false },
  { key: 'contents', done: false },
];

test('the pointer is the first step that is neither done nor skipped', () => {
  assert.equal(resolveActiveStep(steps), 'shipping_label_photo');
});

test('a skipped step is settled — the pointer walks past it', () => {
  assert.equal(
    resolveActiveStep(steps, { skipped: ['shipping_label_photo'] }),
    'box_photo',
  );
});

test('a skipped step is NOT done — it never satisfies a later reader', () => {
  // The distinction the whole waiver model rests on: the pointer moves on, but
  // nothing in the input claims the shot exists.
  const skipped = ['shipping_label_photo'];
  assert.equal(resolveActiveStep(steps, { skipped }), 'box_photo');
  assert.equal(
    steps.find((s) => s.key === 'shipping_label_photo')?.done,
    false,
  );
});

test('a focused step wins, so reopening a finished step is possible', () => {
  assert.equal(
    resolveActiveStep(steps, { focusedKey: 'arrival_check' }),
    'arrival_check',
  );
});

test('a stale focused key degrades to the natural pointer, never to a ghost step', () => {
  // A key left over from a previous carton, or from a variant that dropped the
  // step, must not park the bench on a step that is not in the list.
  assert.equal(
    resolveActiveStep(steps, { focusedKey: 'packing_material' }),
    'shipping_label_photo',
  );
});

test('every step settled resolves to null — the receipt takes the surface', () => {
  assert.equal(resolveActiveStep([{ key: 'contents', done: true }]), null);
  assert.equal(
    resolveActiveStep([{ key: 'contents', done: false }], { skipped: ['contents'] }),
    null,
  );
  assert.equal(resolveActiveStep([]), null);
});

test('the peek names the next UNSETTLED step, not the next array element', () => {
  assert.equal(
    resolveNextStepAfter(steps, 'shipping_label_photo', { skipped: ['box_photo'] }),
    'contents',
  );
});

test('the peek is null when skipping this step settles the carton', () => {
  assert.equal(resolveNextStepAfter(steps, 'contents'), null);
  assert.equal(resolveNextStepAfter(steps, 'nope'), null);
});
