import test from 'node:test';
import assert from 'node:assert/strict';
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

function mark(itemId: number, staffId: number, markedAt: string): DailyCheckMarkFact {
  return { itemId, staffId, markedAt, note: null };
}

test('a staffer who checked nothing still appears, at 0 of N', () => {
  const report = buildDailyCheckReport({
    dateKey: '2026-08-19',
    items: ITEMS,
    marks: [mark(1, 10, '2026-08-19T15:00:00.000Z')],
    roster: ROSTER,
    viewerStaffId: 10,
  });

  const sam = report.staff.find((r) => r.staffId === 20);
  assert.ok(sam, 'Sam must be on the report — "who has not done their checks" is the point');
  assert.equal(sam.doneCount, 0);
  assert.equal(sam.total, 3);
  assert.equal(sam.lastMarkedAt, null);
});

test('least-done leads, so the rows that owe checks are read first', () => {
  const report = buildDailyCheckReport({
    dateKey: '2026-08-19',
    items: ITEMS,
    marks: [
      mark(1, 10, '2026-08-19T15:00:00.000Z'),
      mark(2, 10, '2026-08-19T16:00:00.000Z'),
    ],
    roster: ROSTER,
    viewerStaffId: 10,
  });

  assert.deepEqual(report.staff.map((r) => r.staffId), [20, 10]);
});

test('ticks are ordered by the list, not by when they were marked', () => {
  const report = buildDailyCheckReport({
    dateKey: '2026-08-19',
    items: ITEMS,
    marks: [
      mark(3, 10, '2026-08-19T15:00:00.000Z'),
      mark(1, 10, '2026-08-19T16:00:00.000Z'),
    ],
    roster: ROSTER,
    viewerStaffId: 10,
  });

  const ana = report.staff.find((r) => r.staffId === 10)!;
  assert.deepEqual(ana.doneItemIds, [1, 3]);
  assert.equal(ana.lastMarkedAt, '2026-08-19T16:00:00.000Z', 'newest instant wins');
});

test('a mark against an item not in effect that day is dropped, never counted past the total', () => {
  const report = buildDailyCheckReport({
    dateKey: '2026-08-19',
    items: ITEMS,
    marks: [mark(1, 10, '2026-08-19T15:00:00.000Z'), mark(999, 10, '2026-08-19T15:01:00.000Z')],
    roster: ROSTER,
    viewerStaffId: 10,
  });

  const ana = report.staff.find((r) => r.staffId === 10)!;
  assert.equal(ana.doneCount, 1, 'a retired item must not render as "2 of 3"');
  assert.ok(ana.doneCount <= ana.total);
});

test('someone off the roster who marked still counts — their work is not lost', () => {
  const report = buildDailyCheckReport({
    dateKey: '2026-08-19',
    items: ITEMS,
    marks: [mark(1, 77, '2026-08-19T15:00:00.000Z')],
    roster: ROSTER,
    viewerStaffId: 10,
  });

  const ghost = report.staff.find((r) => r.staffId === 77);
  assert.ok(ghost, 'a departed staffer\'s marks must still appear on a past day');
  assert.equal(ghost.doneCount, 1);
});

test('mine is well-formed even when the viewer is off the roster and marked nothing', () => {
  const report = buildDailyCheckReport({
    dateKey: '2026-08-19',
    items: ITEMS,
    marks: [],
    roster: ROSTER,
    viewerStaffId: 99,
    viewerName: 'Lead',
  });

  assert.equal(report.mine.staffId, 99);
  assert.equal(report.mine.name, 'Lead');
  assert.equal(report.mine.doneCount, 0);
  assert.equal(report.mine.total, 3, 'the denominator is the list, not their marks');
  assert.deepEqual(report.mine.doneItemIds, []);
});

test('a duplicate mark for one frame of optimistic state does not double-count', () => {
  const report = buildDailyCheckReport({
    dateKey: '2026-08-19',
    items: ITEMS,
    marks: [mark(1, 10, '2026-08-19T15:00:00.000Z'), mark(1, 10, '2026-08-19T15:00:01.000Z')],
    roster: ROSTER,
    viewerStaffId: 10,
  });

  assert.equal(report.staff.find((r) => r.staffId === 10)!.doneCount, 1);
});

test('totals: done across everyone, out of list x roster', () => {
  const report = buildDailyCheckReport({
    dateKey: '2026-08-19',
    items: ITEMS,
    marks: [mark(1, 10, '2026-08-19T15:00:00.000Z'), mark(2, 20, '2026-08-19T15:00:00.000Z')],
    roster: ROSTER,
    viewerStaffId: 10,
  });

  assert.equal(report.totalDone, 2);
  assert.equal(report.totalPossible, 6);
});

test('an empty list is a valid day, not a crash', () => {
  const report = buildDailyCheckReport({
    dateKey: '2026-08-19',
    items: [],
    marks: [],
    roster: ROSTER,
    viewerStaffId: 10,
  });

  assert.equal(report.totalPossible, 0);
  assert.equal(report.mine.total, 0);
  assert.equal(report.staff.length, 2);
});
