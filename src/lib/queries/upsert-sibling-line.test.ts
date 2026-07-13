import assert from 'node:assert/strict';
import { test } from 'node:test';

import { upsertSiblingLine } from './receiving-queries';

interface Row {
  id: number;
  condition_grade?: string;
  serials?: Array<{ id: number; serial_number: string }>;
}

test('inserts into an undefined cache (return import on an empty carton)', () => {
  const line: Row = { id: 42, condition_grade: 'USED_A' };
  const next = upsertSiblingLine<Row>(undefined, line);
  assert.deepEqual(next, { success: true, receiving_lines: [line] });
});

test('appends a NEW line, preserving prior order', () => {
  const prev = { success: true, receiving_lines: [{ id: 1 }, { id: 2 }] as Row[] };
  const next = upsertSiblingLine<Row>(prev, { id: 3, condition_grade: 'USED_B' });
  assert.deepEqual(
    next.receiving_lines.map((r) => r.id),
    [1, 2, 3],
    'new line lands last (API order), not prepended',
  );
});

test('shallow-merges onto an existing line (condition + serials patch in place)', () => {
  const prev = {
    success: true,
    receiving_lines: [
      { id: 1, condition_grade: 'USED_A' },
      { id: 2, condition_grade: 'USED_A', serials: [] },
    ] as Row[],
  };
  const next = upsertSiblingLine<Row>(prev, {
    id: 2,
    serials: [{ id: 9, serial_number: 'SN9' }],
  });
  assert.equal(next.receiving_lines.length, 2, 'no duplicate row for an existing id');
  const patched = next.receiving_lines.find((r) => r.id === 2)!;
  assert.equal(patched.condition_grade, 'USED_A', 'untouched fields preserved');
  assert.deepEqual(patched.serials, [{ id: 9, serial_number: 'SN9' }], 'patched field applied');
});

test('returns a fresh envelope + array reference (React Query notifies)', () => {
  const prev = { success: true, receiving_lines: [{ id: 1 }] as Row[] };
  const next = upsertSiblingLine<Row>(prev, { id: 2 });
  assert.notEqual(next, prev);
  assert.notEqual(next.receiving_lines, prev.receiving_lines);
});
