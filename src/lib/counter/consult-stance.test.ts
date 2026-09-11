/**
 *   node --import tsx --test src/lib/counter/consult-stance.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CONSULT_STANCES,
  consultStanceFromFace,
  faceFromConsultStance,
  isConsultStance,
} from './consult-stance';

describe('consult stance', () => {
  it('is exactly work · show · verify', () => {
    assert.deepEqual([...CONSULT_STANCES], ['work', 'show', 'verify']);
  });

  it('maps Work to the staff face and Show/Verify to the customer face', () => {
    assert.equal(faceFromConsultStance('work'), 'staff');
    assert.equal(faceFromConsultStance('show'), 'customer');
    assert.equal(faceFromConsultStance('verify'), 'customer');
  });

  it('recovers Verify from a legacy customer face', () => {
    assert.equal(consultStanceFromFace('staff'), 'work');
    assert.equal(consultStanceFromFace('customer'), 'verify');
  });

  it('rejects unknown labels', () => {
    assert.equal(isConsultStance('work'), true);
    assert.equal(isConsultStance('attract'), false);
  });
});
