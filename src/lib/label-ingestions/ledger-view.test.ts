import assert from 'node:assert/strict';
import test from 'node:test';
import { LABEL_INGESTION_STATES } from './types';
import { ledgerStatus, ledgerViewRows, quarantineCopy } from './ledger-view';

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
  });
});

test('"Needs action" keeps actionable records only, quarantine before ready, newest first within a rank', () => {
  const rows = [
    { id: 1, state: 'MATCHED' as const },
    { id: 2, state: 'APPLIED' as const },
    { id: 3, state: 'QUARANTINED' as const },
    { id: 4, state: 'PARSED' as const },
    { id: 5, state: 'FAILED' as const },
    { id: 6, state: 'MATCHED' as const },
  ];
  assert.deepEqual(ledgerViewRows(rows, 'needs-action').map((row) => row.id), [5, 3, 6, 1]);
  assert.deepEqual(ledgerViewRows(rows, 'applied').map((row) => row.id), [2]);
  assert.deepEqual(ledgerViewRows(rows, 'all').map((row) => row.id), [1, 2, 3, 4, 5, 6]);
});

test('TRACKING_ONLY never claims tracking was found when the record has none', () => {
  assert.equal(quarantineCopy('TRACKING_ONLY', false), 'No tracking number was read from the label.');
  assert.match(quarantineCopy('TRACKING_ONLY', true) ?? '', /no order reference/);
});
