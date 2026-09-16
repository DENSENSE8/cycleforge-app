import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyCheckReport } from '@/lib/daily-checks/report';
import type { DailyCheckItem, DailyCheckMarkFact, DailyCheckStaffMember } from '@/lib/daily-checks/types';

/** The shift default: comes back tomorrow, owed by everyone. */
function recurring(id: number, title: string, sortOrder = id - 1): DailyCheckItem {
  return {
    id,
    title,
    sortOrder,
    kind: 'recurring',
    assignedStaffId: null,
    assignedStaffName: null,
    glyph: null,
  };
}

/** A one-off: must not come back tomorrow; owned when `ownerId` is set. */
function once(id: number, title: string, ownerId: number | null = null): DailyCheckItem {
  return {
    id,
    title,
    sortOrder: id - 1,
    kind: 'once',
    assignedStaffId: ownerId,
    assignedStaffName: ownerId === 10 ? 'Ana' : ownerId === 20 ? 'Sam' : null,
    glyph: null,
  };
}

const ITEMS: DailyCheckItem[] = [
  recurring(1, 'Unlock the dock door'),
  recurring(2, 'Label printer has stock'),
  recurring(3, 'Scanner batteries charged'),
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

// ─── Per-staff denominators (kind + owner) ───────────────────────────────────

test('an unowned once item counts for everyone — nobody was named, so the shift owes it', () => {
  const report = buildDailyCheckReport({
    dateKey: '2026-08-19',
    items: [...ITEMS, once(4, 'Spot-check the returns bin')],
    marks: [],
    roster: ROSTER,
    viewerStaffId: 10,
  });

  for (const row of report.staff) {
    assert.equal(row.total, 4, `${row.name} owes the unowned one-off`);
  }
});

test('an owned once item counts only for its owner — the other four never see it', () => {
  const report = buildDailyCheckReport({
    dateKey: '2026-08-19',
    items: [...ITEMS, once(4, 'Replace the label roll', 10)],
    marks: [],
    roster: ROSTER,
    viewerStaffId: 10,
  });

  const ana = report.staff.find((r) => r.staffId === 10)!;
  const sam = report.staff.find((r) => r.staffId === 20)!;
  assert.equal(ana.total, 4, 'the owner owes their one-off');
  assert.equal(sam.total, 3, 'Sam reads "N of M" over their own list, not the owner\'s');
  assert.equal(report.totalPossible, 7, 'the day\'s ceiling is the SUM of per-staff lists');
});

test('a mark by a non-owner on an owned item is dropped, not counted', () => {
  const report = buildDailyCheckReport({
    dateKey: '2026-08-19',
    items: [...ITEMS, once(4, 'Replace the label roll', 10)],
    marks: [
      mark(1, 10, '2026-08-19T15:00:00.000Z'),
      // Sam covered the desk and ticked Ana's one-off — a real gesture, but it
      // was never in Sam's denominator and must not become "1 of 3" progress.
      mark(4, 20, '2026-08-19T15:01:00.000Z'),
    ],
    roster: ROSTER,
    viewerStaffId: 10,
  });

  const sam = report.staff.find((r) => r.staffId === 20)!;
  assert.equal(sam.doneCount, 0, 'a non-responsible mark inflates nobody');
  assert.ok(!sam.doneItemIds.includes(4));
  assert.equal(report.totalDone, 1);
});

test('a recurring item is unaffected by an owner being set', () => {
  const report = buildDailyCheckReport({
    dateKey: '2026-08-19',
    // An owner on a recurring item is meaningless data (the API only writes it
    // for `once`), and the denominator rule must ignore it just the same.
    items: ITEMS.map((item, i) => (i === 0 ? { ...item, assignedStaffId: 20 } : item)),
    marks: [mark(1, 10, '2026-08-19T15:00:00.000Z')],
    roster: ROSTER,
    viewerStaffId: 10,
  });

  for (const row of report.staff) {
    assert.equal(row.total, 3, 'recurring owes everyone regardless of owner drift');
  }
  const ana = report.staff.find((r) => r.staffId === 10)!;
  assert.equal(ana.doneCount, 1, 'a non-"owner" still gets credit on recurring');
});

test('the report keeps WHEN each task was checked, per staffer', () => {
  // The end goal: a manager reads a day task by task ("completed this at this
  // time"). `lastMarkedAt` alone cannot answer that.
  const report = buildDailyCheckReport({
    dateKey: '2026-08-19',
    items: ITEMS,
    marks: [
      mark(1, 10, '2026-08-19T15:00:00.000Z'),
      mark(3, 10, '2026-08-19T16:30:00.000Z'),
      mark(1, 20, '2026-08-19T17:45:00.000Z'),
    ],
    roster: ROSTER,
    viewerStaffId: 10,
  });

  const ana = report.staff.find((r) => r.staffId === 10);
  assert.ok(ana);
  assert.deepEqual(ana.markedAtByItemId, {
    1: '2026-08-19T15:00:00.000Z',
    3: '2026-08-19T16:30:00.000Z',
  });
  assert.equal(ana.lastMarkedAt, '2026-08-19T16:30:00.000Z', 'lastMarkedAt stays the newest');

  const sam = report.staff.find((r) => r.staffId === 20);
  assert.ok(sam);
  assert.deepEqual(sam.markedAtByItemId, { 1: '2026-08-19T17:45:00.000Z' });
});

test('a duplicate mark keeps the EARLIEST instant — the tick that happened', () => {
  const report = buildDailyCheckReport({
    dateKey: '2026-08-19',
    items: ITEMS,
    marks: [
      mark(2, 10, '2026-08-19T18:00:00.000Z'),
      mark(2, 10, '2026-08-19T15:00:00.000Z'),
    ],
    roster: ROSTER,
    viewerStaffId: 10,
  });
  assert.equal(report.mine.doneCount, 1, 'still one tick');
  assert.deepEqual(report.mine.markedAtByItemId, { 2: '2026-08-19T15:00:00.000Z' });
});

test('an unchecked item has no instant at all — absent, never a placeholder', () => {
  const report = buildDailyCheckReport({
    dateKey: '2026-08-19',
    items: ITEMS,
    marks: [mark(1, 10, '2026-08-19T15:00:00.000Z')],
    roster: ROSTER,
    viewerStaffId: 10,
  });
  assert.equal(report.mine.markedAtByItemId[2], undefined);
  assert.equal(Object.keys(report.mine.markedAtByItemId).length, 1);
});
