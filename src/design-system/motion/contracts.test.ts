import assert from 'node:assert/strict';
import test from 'node:test';
import { defineStateMotionContract, motionTargetFor } from './contracts';

test('a state-motion contract is a pure semantic-state lookup', () => {
  const contract = defineStateMotionContract<'idle' | 'busy', { opacity: number }>({
    targets: { idle: { opacity: 1 }, busy: { opacity: 0.5 } },
    transition: { duration: 0.2 },
    reducedTransition: { duration: 0 },
  });

  assert.deepEqual(motionTargetFor(contract, 'idle'), { opacity: 1 });
  assert.deepEqual(motionTargetFor(contract, 'busy'), { opacity: 0.5 });
});

test('target lookup does not mutate the contract', () => {
  const target = Object.freeze({ scale: 1 });
  const contract = defineStateMotionContract<'still', { scale: number }>({
    targets: { still: target },
    transition: { type: 'spring', stiffness: 300, damping: 30 },
    reducedTransition: { duration: 0 },
  });

  assert.equal(motionTargetFor(contract, 'still'), target);
});
