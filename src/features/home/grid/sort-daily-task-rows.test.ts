/**
 * Render-contract — Daily's row ORDER.
 *
 *   npx tsx --test src/features/home/grid/sort-daily-task-rows.test.ts
 *
 * What the order promises: the UNSORTED branch is authored order with the
 * shift list first — recurring items lead, today's one-offs sit under them —
 * and `sortOrder` then `id` keep the order total. An explicit header sort is
 * the operator answering a different question and never re-groups by kind.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { sortDailyTaskRows } from './sort-daily-task-rows';
import type { DailyTaskRow } from './daily-task-row';

function row(id: number, sortOrder: number, kind: 'recurring' | 'once' = 'recurring'): DailyTaskRow {
  return {
    id,
    title: `Task ${id}`,
    sortOrder,
    kind,
    assignedStaffId: null,
    assignedStaffName: null,
    done: false,
    teamDone: 0,
    teamTotal: 0,
    markedAt: null,
  };
}

test('authored order: the shift list reads first, one-offs sit under it', () => {
  const sorted = sortDailyTaskRows(
    [row(1, 4, 'once'), row(2, 1), row(3, 0), row(4, 2, 'once'), row(5, 2)],
    null,
    null,
  );
  assert.deepEqual(
    sorted.map((r) => r.id),
    [3, 2, 5, 4, 1],
    'recurring in authored order, then once in authored order',
  );
});

test('an explicit header sort never makes kind the primary key — but its tiebreak is authored order', () => {
  const sorted = sortDailyTaskRows([row(1, 9, 'once'), row(2, 0)], 'status', 'asc');
  assert.deepEqual(
    sorted.map((r) => r.id),
    [2, 1],
    'both rows tie on the state fact, so authored order breaks it',
  );
});

test('authored order keeps the id tiebreak so the order stays total', () => {
  const sorted = sortDailyTaskRows([row(9, 2), row(2, 2)], null, null);
  assert.deepEqual(
    sorted.map((r) => r.id),
    [2, 9],
  );
});

