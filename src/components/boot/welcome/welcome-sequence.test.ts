import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INITIAL_WELCOME_SEQUENCE,
  currentWelcomePhase,
  planWelcomeAdvance,
  welcomeSequenceDone,
  welcomeSequenceReducer,
} from './welcome-sequence';

test('skips absent regions without inserting a dead phase', () => {
  const plan = planWelcomeAdvance(0, new Set(['sidebar']));
  assert.deepEqual(plan, { skipped: [], nextIndex: 0 });

  const afterHeader = planWelcomeAdvance(1, new Set(['sidebar']));
  assert.deepEqual(afterHeader, { skipped: ['sidebar'], nextIndex: 2 });
});

test('advance atomically marks skips and schedules the next phase', () => {
  const state = welcomeSequenceReducer(INITIAL_WELCOME_SEQUENCE, {
    type: 'advance',
    plan: { skipped: ['header', 'sidebar'], nextIndex: 2 },
  });
  assert.equal(state.steps.header, 'skipped');
  assert.equal(state.steps.sidebar, 'skipped');
  assert.equal(state.steps.main, 'wait');
  assert.equal(currentWelcomePhase(state), 'main');
});

test('the terminal cursor is an explicit completed state', () => {
  const state = welcomeSequenceReducer(INITIAL_WELCOME_SEQUENCE, {
    type: 'advance',
    plan: { skipped: [], nextIndex: 3 },
  });
  assert.equal(welcomeSequenceDone(state), true);
  assert.equal(currentWelcomePhase(state), null);
});
