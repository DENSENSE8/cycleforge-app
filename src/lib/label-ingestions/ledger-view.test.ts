import assert from 'node:assert/strict';
import test from 'node:test';
import { LABEL_INGESTION_STATES } from './types';
import { ledgerStatus, quarantineCopy } from './ledger-view';

test('only MATCHED offers apply, and only QUARANTINED/FAILED offer reprocess', () => {
  const actions = Object.fromEntries(LABEL_INGESTION_STATES.map((state) => [state, ledgerStatus(state).action]));
  assert.deepEqual(actions, {
    RECEIVED: null,
    STAGED: null,
    PARSED: null,
    MATCHED: 'apply',
    QUARANTINED: 'retry',
    APPLYING: null,
    APPLIED: null,
    FAILED: 'retry',
    // Operator-paired to an order: resolved — offering Reprocess would undo the pairing.
    LINKED: null,
  });
});

test('TRACKING_ONLY never claims tracking was found when the record has none', () => {
  assert.equal(quarantineCopy('TRACKING_ONLY', false), 'No tracking number was read from the label.');
  assert.match(quarantineCopy('TRACKING_ONLY', true) ?? '', /no order reference/);
});
