import test from 'node:test';
import assert from 'node:assert/strict';
import { recordFlowLabels } from './RecordFlowFacts';

test('recordFlowLabels preserves the outbound relationship vocabulary', () => {
  assert.deepEqual(recordFlowLabels('outbound'), {
    party: 'Customer',
    movement: 'Shipping',
  });
});

test('recordFlowLabels mirrors the same roles for inbound records', () => {
  assert.deepEqual(recordFlowLabels('inbound'), {
    party: 'Vendor',
    movement: 'Purchased from',
  });
});
