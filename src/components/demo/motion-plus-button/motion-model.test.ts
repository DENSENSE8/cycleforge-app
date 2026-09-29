import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO_PHASE_MS, LISTING_BUTTON_VISUAL } from './motion-model';

test('the same element resolves to a circle for both transient phases', () => {
  assert.equal(LISTING_BUTTON_VISUAL.working.width, LISTING_BUTTON_VISUAL.done.width);
  assert.equal(LISTING_BUTTON_VISUAL.working.radius, LISTING_BUTTON_VISUAL.done.radius);
  assert.equal(LISTING_BUTTON_VISUAL.done.radius, LISTING_BUTTON_VISUAL.done.width / 2);
});

test('completion changes contrast without changing the transient geometry', () => {
  assert.notEqual(LISTING_BUTTON_VISUAL.working.background, LISTING_BUTTON_VISUAL.done.background);
  assert.notEqual(LISTING_BUTTON_VISUAL.working.foreground, LISTING_BUTTON_VISUAL.done.foreground);
});

test('the confirmation hold ends after the operation resolves', () => {
  assert.ok(DEMO_PHASE_MS.doneToIdle > DEMO_PHASE_MS.workingToDone);
  assert.ok(DEMO_PHASE_MS.reducedDoneToIdle > DEMO_PHASE_MS.reducedWorkingToDone);
});
