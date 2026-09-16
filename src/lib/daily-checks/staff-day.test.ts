/**
 * Contract — one staffer's day, projected out of the day report.
 *
 *   pnpm exec tsx --test src/lib/daily-checks/staff-day.test.ts
 *
 * What a manager reading this list is entitled to:
 *   - the MISSES are in it (an unchecked task is the point of the report);
 *   - work that was never this staffer's job is NOT in it, so a miss is a real
 *     accusation and not an artefact of the denominator;
 *   - the checked half reads chronologically — "walk me through the shift";
 *   - the per-staff fraction is the report's, never re-derived here.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDailyCheckReport } from './report';
import { buildStaffDay, buildStaffDays } from './staff-day';
import type { DailyCheckItem, DailyCheckMarkFact } from './types';

const ANA = { staffId: 1, name: 'Ana' };
const BEN = { staffId: 2, name: 'Ben' };
const DAY = '2026-09-15';

function item(over: Partial<DailyCheckItem> & { id: number; title: string }): DailyCheckItem {
  return {
    sortOrder: over.id,
    kind: 'recurring',
    assignedStaffId: null,
    assignedStaffName: null,
    glyph: null,
    ticketId: null,
    ...over,
  };
}

function mark(itemId: number, staffId: number, markedAt: string): DailyCheckMarkFact {
  return { itemId, staffId, markedAt, note: null };
}

function report(items: DailyCheckItem[], marks: DailyCheckMarkFact[]) {
  return buildDailyCheckReport({
    dateKey: DAY,
    items,
    marks,
    roster: [ANA, BEN],
    viewerStaffId: ANA.staffId,
  });
}

const LOCK = item({ id: 1, title: 'Front door locked' });
const SWEEP = item({ id: 2, title: 'Sweep the bench' });
const TICKET = item({ id: 3, title: 'Ticket #48120', kind: 'once', ticketId: 48120 });

test('a checked task carries the instant it was ticked, not just a flag', () => {
  const day = buildStaffDay(report([LOCK, SWEEP], [mark(1, ANA.staffId, '2026-09-15T16:14:00.000Z')]), ANA.staffId);
  const locked = day?.tasks.find((t) => t.itemId === 1);
  assert.equal(locked?.title, 'Front door locked');
  assert.equal(locked?.checkedAt, '2026-09-15T16:14:00.000Z');
});

test('an unchecked task stays in the list with a null instant — the miss is the point', () => {
  const day = buildStaffDay(report([LOCK, SWEEP], [mark(1, ANA.staffId, '2026-09-15T16:14:00.000Z')]), ANA.staffId);
  assert.equal(day?.tasks.length, 2);
  assert.equal(day?.tasks.find((t) => t.itemId === 2)?.checkedAt, null);
});

test('a staffer who checked nothing gets every task, all null — never an empty day', () => {
  const day = buildStaffDay(report([LOCK, SWEEP], []), BEN.staffId);
  assert.equal(day?.tasks.length, 2);
  assert.ok(day?.tasks.every((t) => t.checkedAt === null));
  assert.equal(day?.doneCount, 0);
  assert.equal(day?.lastMarkedAt, null);
});

test('a one-off owned by someone else is absent — it was never this staffer’s job', () => {
  const ansOnly = item({ id: 4, title: 'Call the carrier', kind: 'once', assignedStaffId: ANA.staffId, assignedStaffName: 'Ana' });
  const bensDay = buildStaffDay(report([LOCK, ansOnly], []), BEN.staffId);
  assert.deepEqual(bensDay?.tasks.map((t) => t.itemId), [1], 'Ben is not accused of missing Ana’s one-off');

  const anasDay = buildStaffDay(report([LOCK, ansOnly], []), ANA.staffId);
  assert.deepEqual(anasDay?.tasks.map((t) => t.itemId), [1, 4]);
  assert.equal(anasDay?.tasks.find((t) => t.itemId === 4)?.assignedStaffName, 'Ana');
});

test('checked tasks read in tick order; everything owed follows in authored order', () => {
  const day = buildStaffDay(
    report(
      [LOCK, SWEEP, TICKET],
      [mark(3, ANA.staffId, '2026-09-15T15:00:00.000Z'), mark(1, ANA.staffId, '2026-09-15T18:30:00.000Z')],
    ),
    ANA.staffId,
  );
  assert.deepEqual(
    day?.tasks.map((t) => t.itemId),
    [3, 1, 2],
    'ticket at 15:00, door at 18:30, then the unchecked sweep',
  );
});

test('a ticket row carries its ticket id through the projection', () => {
  const day = buildStaffDay(report([TICKET], []), ANA.staffId);
  assert.equal(day?.tasks[0]?.ticketId, 48120);
  assert.equal(day?.tasks[0]?.kind, 'once');
});

test('the fraction is the report’s per-staff denominator, not a re-count', () => {
  const anasOnly = item({ id: 4, title: 'Call the carrier', kind: 'once', assignedStaffId: ANA.staffId, assignedStaffName: 'Ana' });
  const r = report([LOCK, anasOnly], [mark(1, BEN.staffId, '2026-09-15T17:00:00.000Z')]);
  const bens = buildStaffDay(r, BEN.staffId);
  assert.equal(bens?.total, 1, 'Ana’s one-off is not in Ben’s denominator');
  assert.equal(bens?.doneCount, 1);
});

test('an unknown staffer is null, not a fabricated empty day', () => {
  assert.equal(buildStaffDay(report([LOCK], []), 999), null);
});

test('the whole roster projects, including who did nothing', () => {
  const days = buildStaffDays(report([LOCK], [mark(1, ANA.staffId, '2026-09-15T16:00:00.000Z')]));
  assert.deepEqual(days.map((d) => d.name).sort(), ['Ana', 'Ben']);
  assert.equal(days.find((d) => d.name === 'Ben')?.tasks[0]?.checkedAt, null);
});

test('the day key rides through — a report is always about one civil day', () => {
  assert.equal(buildStaffDay(report([LOCK], []), ANA.staffId)?.dateKey, DAY);
});
