/**
 * Render-contract — the Daily compound adapter.
 *
 *   npx tsx --test src/features/home/grid/daily-task-compound-view.test.ts
 *
 * What the adapter promises:
 *   - the note line is COMPOSED, never replaced: a `once` item leads with
 *     "Today only", a recurring item paints exactly the team fraction it
 *     always painted;
 *   - the cadence word lives in the note, never on the state pill (the pill
 *     answers "did I do it" — one meaning per control);
 *   - the strike still reads MY mark, and the identity face stays the bare
 *     checklist handle.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyTaskCompoundView } from './daily-task-compound-view';
import type { DailyTaskRow } from './daily-task-row';

function row(overrides: Partial<DailyTaskRow> = {}): DailyTaskRow {
  return {
    id: 7,
    title: 'Front door locked',
    sortOrder: 0,
    kind: 'recurring',
    assignedStaffId: null,
    assignedStaffName: null,
    done: false,
    teamDone: 3,
    teamTotal: 5,
    markedAt: null,
    ...overrides,
  };
}

test('a recurring row paints exactly the team fraction — the exception is unmarked', () => {
  assert.equal(dailyTaskCompoundView(row()).note, '3/5 done');
  assert.equal(dailyTaskCompoundView(row({ done: true })).titleStruck, true);
});

test('a once row leads the note with Today only, composed with the fraction', () => {
  assert.equal(dailyTaskCompoundView(row({ kind: 'once' })).note, 'Today only · 3/5 done');
});

test('a once row with no denominator still says Today only — never null', () => {
  assert.equal(
    dailyTaskCompoundView(row({ kind: 'once', teamDone: 0, teamTotal: 0 })).note,
    'Today only',
  );
});

test('the state pill keeps one meaning — cadence never touches the label', () => {
  const recurring = dailyTaskCompoundView(row());
  const once = dailyTaskCompoundView(row({ kind: 'once' }));
  assert.equal(once.stateLabel, recurring.stateLabel);
  assert.equal(once.stateTone, recurring.stateTone);
});

test('the identity face stays the bare checklist handle', () => {
  assert.deepEqual(dailyTaskCompoundView(row()).identityFace, {
    value: '7',
    label: 'Checklist item id',
  });
});
