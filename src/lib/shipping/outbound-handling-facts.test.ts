import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeOutboundHandlingFacts,
  outboundHandlingFactFaces,
} from './outbound-handling-facts';

test('outbound handling facts accept only the governed catalog vocabulary', () => {
  assert.deepEqual(
    normalizeOutboundHandlingFacts([' HAZMAT ', 'oversized', 'hazmat', 'free-text warning', 3]),
    ['hazmat', 'oversized'],
  );
});

test('outbound handling faces carry named semantic treatments', () => {
  assert.deepEqual(outboundHandlingFactFaces(['hazmat', 'two_person_lift']), [
    { id: 'hazmat', label: 'Hazmat', tone: 'destructive' },
    { id: 'two_person_lift', label: 'Two-person lift', tone: 'warning' },
  ]);
});
