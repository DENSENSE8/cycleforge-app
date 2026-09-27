/**
 * Answer emphasis — only the turn's own identifiers become chips; numbers
 * with units turn bold; code is untouched.
 * Run: npx tsx --test src/lib/assistant/answer-emphasis.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerCopyIds, emphasizeAnswer } from './answer-emphasis';

const ids = answerCopyIds([
  {
    kind: 'table',
    title: 'Where is 00066-P-2',
    columns: ['Bin', 'Room', 'Qty'],
    rows: [
      { Bin: 'C-03-12-3', Room: 'Zone 3', Qty: 41 },
      { Bin: 'C-03-16-3', Room: 'Zone 3', Qty: 1 },
    ],
    identity: { title: 'Bose Wave III Remote', ids: [{ label: 'SKU', value: '00066-P-2' }] },
  },
]);

test('ids come from the identity header and id columns only', () => {
  assert.deepEqual([...ids.entries()].sort(), [
    ['00066-P-2', 'SKU'],
    ['C-03-12-3', 'Bin'],
    ['C-03-16-3', 'Bin'],
  ]);
});

test('known ids become code spans; a longer look-alike does not', () => {
  assert.equal(
    emphasizeAnswer('SKU 00066-P-2 is in C-03-12-3, not C-03-12-34 or 00066-P-21.', ids),
    'SKU `00066-P-2` is in `C-03-12-3`, not C-03-12-34 or 00066-P-21.',
  );
});

test('numbers with units and a bare parenthesised quantity turn bold; digits inside ids do not', () => {
  assert.equal(
    emphasizeAnswer('C-03-12-3 (41) and C-03-16-3 (1 unit): 42 units, 35% and $1,200.50.', ids),
    '`C-03-12-3` (**41**) and `C-03-16-3` (**1 unit**): **42 units**, **35%** and **$1,200.50**.',
  );
});

test('existing bold and code are left as written', () => {
  assert.equal(emphasizeAnswer('**41 units** in `C-03-12-3`.', ids), '**41 units** in `C-03-12-3`.');
});
