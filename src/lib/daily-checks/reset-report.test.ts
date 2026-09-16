import test from 'node:test';
import assert from 'node:assert/strict';
import { clearMineFromReport } from '@/lib/daily-checks/reset-report';
import { buildDailyCheckReport } from '@/lib/daily-checks/report';
import type { DailyCheckItem, DailyCheckMarkFact, DailyCheckStaffMember } from '@/lib/daily-checks/types';

const ITEMS: DailyCheckItem[] = [
  { id: 1, title: 'Unlock the dock door', sortOrder: 0 },
  { id: 2, title: 'Label printer has stock', sortOrder: 1 },
  { id: 3, title: 'Scanner batteries charged', sortOrder: 2 },
];

const ROSTER: DailyCheckStaffMember[] = [
  { staffId: 10, name: 'Ana' },
  { staffId: 20, name: 'Sam' },
];

const mark = (itemId: number, staffId: number, markedAt: string): DailyCheckMarkFact => ({
  itemId,
  staffId,
  markedAt,
  note: null,
});

/** Ana ticked two, Sam ticked one — so a reset by Ana must cost exactly two. */
const dayWithBothStaffChecking = () =>
  buildDailyCheckReport({
    dateKey: '2026-09-14',
    items: ITEMS,
    marks: [
      mark(1, 10, '2026-09-14T15:00:00.000Z'),
      mark(2, 10, '2026-09-14T16:00:00.000Z'),
      mark(1, 20, '2026-09-14T17:00:00.000Z'),
    ],
    roster: ROSTER,
    viewerStaffId: 10,
  });

test('reset clears the viewer everywhere they appear — list row and roster row', () => {
  const before = dayWithBothStaffChecking();
  const after = clearMineFromReport(before);

  assert.deepEqual(after.mine.doneItemIds, []);
  assert.equal(after.mine.doneCount, 0);
  assert.equal(after.mine.lastMarkedAt, null);

  const ana = after.staff.find((r) => r.staffId === 10);
  assert.ok(ana, 'the viewer stays on the roster after a reset — they owe the checks again');
  assert.deepEqual(ana.doneItemIds, [], 'roster row must agree with `mine` or the two panes disagree');
  assert.equal(ana.doneCount, 0);
});

test('reset touches nobody else — it is my eraser, not the org’s', () => {
  const after = clearMineFromReport(dayWithBothStaffChecking());

  const sam = after.staff.find((r) => r.staffId === 20);
  assert.ok(sam);
  assert.deepEqual(sam.doneItemIds, [1]);
  assert.equal(sam.doneCount, 1);
});

test('the all-staff numerator drops by the viewer’s count, not to zero', () => {
  const before = dayWithBothStaffChecking();
  assert.equal(before.totalDone, 3);

  const after = clearMineFromReport(before);
  assert.equal(after.totalDone, 1, "Sam's tick survives Ana's reset");
  assert.equal(after.totalPossible, before.totalPossible, 'the denominator is the list, not the ticks');
});

test('resetting an already-empty day is a no-op, never a negative headline', () => {
  const before = buildDailyCheckReport({
    dateKey: '2026-09-14',
    items: ITEMS,
    marks: [mark(1, 20, '2026-09-14T17:00:00.000Z')],
    roster: ROSTER,
    viewerStaffId: 10,
  });

  const after = clearMineFromReport(before);
  assert.equal(after.totalDone, 1);
  assert.equal(after.mine.doneCount, 0);
});

test('an off-roster viewer WITH ticks is cleared in their synthesized row too', () => {
  // `report.ts` synthesizes a `Staff #N` row for anyone who marked but is off
  // the roster (a lead covering a day they were not scheduled). The patch must
  // match that row by staffId, NOT by roster membership.
  const before = buildDailyCheckReport({
    dateKey: '2026-09-14',
    items: ITEMS,
    marks: [mark(1, 99, '2026-09-14T15:00:00.000Z'), mark(1, 20, '2026-09-14T17:00:00.000Z')],
    roster: ROSTER,
    viewerStaffId: 99,
  });
  assert.equal(before.mine.doneCount, 1);
  assert.ok(before.staff.some((r) => r.staffId === 99), 'fixture: the lead is synthesized onto the report');

  const after = clearMineFromReport(before);
  const lead = after.staff.find((r) => r.staffId === 99);
  assert.ok(lead);
  assert.equal(lead.doneCount, 0, 'the synthesized row is still the viewer — it must clear with `mine`');
  assert.equal(after.mine.doneCount, 0);
  assert.equal(after.totalDone, 1, "only the lead's tick leaves the numerator");
});

test('an off-roster viewer with NO ticks has no staff row — reset leaves everyone alone', () => {
  // types.ts guarantees a well-formed `mine` even with no matching `staff` row;
  // this is that branch (`emptyRow` fallback). Nothing to clear, nothing to touch.
  const before = buildDailyCheckReport({
    dateKey: '2026-09-14',
    items: ITEMS,
    marks: [mark(1, 20, '2026-09-14T17:00:00.000Z')],
    roster: ROSTER,
    viewerStaffId: 99,
  });
  assert.ok(!before.staff.some((r) => r.staffId === 99), 'fixture: viewer has no roster row');

  const after = clearMineFromReport(before);
  assert.equal(after.mine.doneCount, 0);
  assert.equal(after.totalDone, before.totalDone, 'no row of the viewer existed, so the numerator holds');
  assert.deepEqual(
    after.staff.map((r) => [r.staffId, r.doneCount]),
    before.staff.map((r) => [r.staffId, r.doneCount]),
  );
});

test('the input report is not mutated — a failed request rolls back to it', () => {
  const before = dayWithBothStaffChecking();
  clearMineFromReport(before);

  assert.equal(before.mine.doneCount, 2);
  assert.deepEqual(before.mine.doneItemIds, [1, 2]);
  assert.equal(before.totalDone, 3);
});

test('reset clears the per-task instants, not just the ticks', () => {
  // The manager report reads `markedAtByItemId`; a stale instant would claim a
  // task was completed at a time it now shows unchecked.
  const before = dayWithBothStaffChecking();
  assert.ok(Object.keys(before.mine.markedAtByItemId).length > 0, 'fixture: the viewer has instants');

  const after = clearMineFromReport(before);
  assert.deepEqual(after.mine.markedAtByItemId, {});

  const sam = after.staff.find((r) => r.staffId === 20);
  assert.ok(sam);
  assert.deepEqual(
    sam.markedAtByItemId,
    { 1: '2026-09-14T17:00:00.000Z' },
    "a peer's instants survive my reset",
  );
});
