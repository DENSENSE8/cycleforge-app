import assert from 'node:assert/strict';
import test from 'node:test';
import { filterTriageBands, parseStatusParam } from './triage-list-state';

test('parseStatusParam drops unknown values and keeps vocabulary order', () => {
  assert.deepEqual([...parseStatusParam('closed,unknown,arriving,closed', ['arriving', 'closed', 'other'] as const)], ['arriving', 'closed']);
});

test('filterTriageBands applies include and exclusion cuts with exclusion winning', () => {
  const bands = [
    ['today', [
      { key: 'a', rows: [{ status: 'open' }, { status: 'closed' }] },
      { key: 'b', rows: [{ status: 'closed' }] },
    ]],
  ] as const;
  const filtered = filterTriageBands(
    bands,
    (group) => group.key,
    (row) => [row.status],
    new Set(['open', 'closed']),
    new Set(['closed']),
  );
  assert.deepEqual(filtered, [['today', [{ key: 'a', rows: [{ status: 'open' }] }]]]);
});
