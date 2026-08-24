import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildStaffTaskRows } from '@/lib/tasks/staff-task-row';
import { TASKS_TABLE_BINDING } from '@/features/tasks/grid/tasks-table-definition';
import type { StaffTodoItem } from '@/lib/queries/staff-todos-queries';

/**
 * The My Tasks row model — the view model the `tasks.mine` grid reads.
 *
 * Everything here is a function of `(row, nowMs)`, which is the point: the
 * table passes ONE clock, so the Status cell and the Resets cell cannot
 * disagree about what time it is.
 */

const HOUR = 3_600_000;
const NOW = 1_700_000_000_000;

function item(over: Partial<StaffTodoItem> = {}): StaffTodoItem {
  return {
    id: 1,
    station: 'UNBOX',
    kind: 'general',
    text: 'Sweep the bench',
    sort_order: 0,
    recur_interval_ms: null,
    recur_anchor_ms: null,
    completed_at_ms: null,
    last_completed_at_ms: null,
    ...over,
  };
}

test('a general task is done from its own stamp', () => {
  const [open] = buildStaffTaskRows([item()], NOW);
  const [done] = buildStaffTaskRows([item({ completed_at_ms: NOW - 60_000 })], NOW);
  assert.equal(open.done, false);
  assert.equal(open.resetsAtMs, null, 'a to-do has no cycle, so it has no reset');
  assert.equal(done.done, true);
  assert.equal(done.checkedAtMs, NOW - 60_000);
});

test('a recurring task is done only INSIDE the current cycle', () => {
  const base = item({
    kind: 'recurring',
    recur_interval_ms: 4 * HOUR,
    recur_anchor_ms: NOW - 10 * HOUR,
  });
  // Checked 30 minutes ago — inside the cycle that is running now.
  const [fresh] = buildStaffTaskRows(
    [{ ...base, last_completed_at_ms: NOW - 30 * 60_000 }],
    NOW,
  );
  // Checked 6 hours ago — a cycle and a half back, so this cycle is open again.
  const [stale] = buildStaffTaskRows([{ ...base, last_completed_at_ms: NOW - 6 * HOUR }], NOW);
  assert.equal(fresh.done, true);
  assert.equal(stale.done, false, 'rollover reopens the task without any write');
});

test('the reset stamp is the END of the running cycle, never the start', () => {
  const [row] = buildStaffTaskRows(
    [
      item({
        kind: 'recurring',
        recur_interval_ms: 4 * HOUR,
        recur_anchor_ms: NOW - 10 * HOUR,
      }),
    ],
    NOW,
  );
  assert.ok(row.resetsAtMs != null && row.resetsAtMs > NOW, 'a reset in the past is not a reset');
  assert.equal(row.resetsAtMs, NOW + 2 * HOUR, '10h after anchor = 2h into the third cycle');
});

test('an archived row is carried as history, not silently reopened', () => {
  const [row] = buildStaffTaskRows(
    [item({ archived_at_ms: NOW - HOUR, completed_at_ms: NOW - 2 * HOUR })],
    NOW,
  );
  assert.equal(row.archived, true);
  assert.equal(row.done, true, 'it was checked off before it was deleted, and still was');
});

test('the registered definition sends a row click to the right-rail record plane', () => {
  assert.equal(TASKS_TABLE_BINDING.definition.id, 'tasks.mine');
  assert.deepEqual(TASKS_TABLE_BINDING.recordPlane, {
    kind: 'inspector',
    occupantId: 'detail:staff-task',
  });
  // The checkbox is the row's verb, so selection must not be mounted over it.
  assert.equal(TASKS_TABLE_BINDING.definition.capabilities?.multiSelect, false);
  // Renaming is the inspector's job — one editor, not two that can drift.
  assert.equal(TASKS_TABLE_BINDING.definition.capabilities?.inCellEdit, false);
});
