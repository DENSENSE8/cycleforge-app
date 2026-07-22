import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  arrivalReadinessHeadline,
  deriveArrivalPipelineStates,
  isArrivalClassified,
  isArrivalStaged,
} from './arrival-journey';

describe('isArrivalClassified', () => {
  it('treats matched sources as classified without intake_type', () => {
    assert.equal(isArrivalClassified('zoho', null), true);
  });

  it('requires intake_type for unmatched', () => {
    assert.equal(isArrivalClassified('unmatched', null), false);
    assert.equal(isArrivalClassified('unmatched', 'PO'), true);
  });
});

describe('isArrivalStaged', () => {
  it('needs both shelf and lane', () => {
    assert.equal(isArrivalStaged(12, null), false);
    assert.equal(isArrivalStaged(null, 'PO_STANDARD'), false);
    assert.equal(isArrivalStaged(12, 'PO_STANDARD'), true);
  });
});

describe('deriveArrivalPipelineStates', () => {
  it('keeps later steps pending until door is done', () => {
    const states = deriveArrivalPipelineStates({
      doorAt: null,
      source: 'zoho',
      intakeType: 'PO',
      stagingLocationId: 1,
      priorityLane: 'PO_STANDARD',
      triageComplete: true,
    });
    assert.equal(states.door, 'active');
    assert.equal(states.classified, 'pending');
    assert.equal(states.staged, 'pending');
    assert.equal(states.ready, 'pending');
  });

  it('activates classify after door scan for unmatched', () => {
    const states = deriveArrivalPipelineStates({
      doorAt: '2026-07-21 14:27:00',
      source: 'unmatched',
      intakeType: null,
      stagingLocationId: null,
      priorityLane: null,
      triageComplete: false,
    });
    assert.equal(states.door, 'done');
    assert.equal(states.classified, 'active');
    assert.equal(arrivalReadinessHeadline(states), 'Classify this arrival.');
  });

  it('marks ready when triage_complete', () => {
    const states = deriveArrivalPipelineStates({
      doorAt: '2026-07-21 14:27:00',
      source: 'zoho',
      intakeType: 'PO',
      stagingLocationId: 9,
      priorityLane: 'PO_STANDARD',
      triageComplete: true,
    });
    assert.equal(states.ready, 'done');
    assert.equal(arrivalReadinessHeadline(states), 'Ready for unbox.');
  });
});
