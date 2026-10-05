/**
 * Arrival mobile flow — classify URLs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARRIVAL_CLASSIFY_STEPS,
  arrivalClassifyStepIndex,
  mobileArrivalClassifyHref,
  nextArrivalClassifyStep,
  parseArrivalClassifyStep,
  parseArrivalReceivingId,
  prevArrivalClassifyStep,
} from './arrival-mobile-flow';

test('ARRIVAL_CLASSIFY_STEPS order is platform → type → priority', () => {
  assert.deepEqual([...ARRIVAL_CLASSIFY_STEPS], ['platform', 'type', 'priority']);
});

test('parseArrivalClassifyStep defaults to platform', () => {
  assert.equal(parseArrivalClassifyStep('type'), 'type');
  assert.equal(parseArrivalClassifyStep('priority'), 'priority');
  assert.equal(parseArrivalClassifyStep('bogus'), 'platform');
  assert.equal(parseArrivalClassifyStep(null), 'platform');
});

test('parseArrivalReceivingId', () => {
  assert.equal(parseArrivalReceivingId('42'), 42);
  assert.equal(parseArrivalReceivingId('0'), null);
  assert.equal(parseArrivalReceivingId('x'), null);
});

test('mobileArrivalClassifyHref lands on platform', () => {
  assert.equal(
    mobileArrivalClassifyHref(7, 'platform'),
    '/m/scan?rid=7&step=platform',
  );
});

test('next / prev classify steps', () => {
  assert.equal(nextArrivalClassifyStep('platform'), 'type');
  assert.equal(nextArrivalClassifyStep('type'), 'priority');
  assert.equal(nextArrivalClassifyStep('priority'), null);
  assert.equal(prevArrivalClassifyStep('priority'), 'type');
  assert.equal(prevArrivalClassifyStep('platform'), null);
  assert.equal(arrivalClassifyStepIndex('type'), 1);
});
