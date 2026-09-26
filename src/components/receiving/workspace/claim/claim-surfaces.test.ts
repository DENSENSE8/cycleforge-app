import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLAIM_RENDERS_IN_BOTH } from './claim-surfaces';

test('the transitional pairing is on', () => {
  assert.equal(CLAIM_RENDERS_IN_BOTH, true);
});
