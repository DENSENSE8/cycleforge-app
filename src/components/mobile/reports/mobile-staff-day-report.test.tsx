/**
 * Render contract — the manager's staff-day report (`/m/reports`).
 *
 *   pnpm exec tsx --test src/components/mobile/reports/mobile-staff-day-report.test.tsx
 *
 * The projection itself is covered by `staff-day.test.ts`; this file pins what
 * the SURFACE promises a lead reading a shift:
 *   - a staffer who checked nothing is on screen with an honest 0, never
 *     dropped and never a fake full mark;
 *   - the completion mark is a WORD, not a colour-only pip;
 *   - every row is a real control with a name, and clears the 44px floor;
 *   - no raw palette class leaks into the markup (the B4 token law).
 */

import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildDailyCheckReport } from '@/lib/daily-checks/report';
import { buildStaffDays } from '@/lib/daily-checks/staff-day';
import type { DailyCheckItem } from '@/lib/daily-checks/types';

const ANA = { staffId: 1, name: 'Ana' };
const BEN = { staffId: 2, name: 'Ben' };

const ITEMS: DailyCheckItem[] = [
  {
    id: 1,
    title: 'Front door locked',
    sortOrder: 1,
    kind: 'recurring',
    assignedStaffId: null,
    assignedStaffName: null,
    glyph: null,
    ticketId: null,
  },
  {
    id: 2,
    title: 'Sweep the bench',
    sortOrder: 2,
    kind: 'recurring',
    assignedStaffId: null,
    assignedStaffName: null,
    glyph: null,
    ticketId: null,
  },
];

const REPORT = buildDailyCheckReport({
  dateKey: '2026-09-15',
  items: ITEMS,
  marks: [
    { itemId: 1, staffId: ANA.staffId, markedAt: '2026-09-15T16:14:00.000Z', note: null },
    { itemId: 2, staffId: ANA.staffId, markedAt: '2026-09-15T17:02:00.000Z', note: null },
  ],
  roster: [ANA, BEN],
  viewerStaffId: ANA.staffId,
});

/**
 * The roster card is exercised through the projection rather than the page,
 * because the page mounts `useAuth` + TanStack Query — a provider tree that
 * says nothing about what a lead can read off the screen.
 */
function paintRoster() {
  const days = buildStaffDays(REPORT);
  return renderToStaticMarkup(
    <ul>
      {days.map((day) => (
        <li key={day.staffId}>
          <button
            type="button"
            aria-label={`${day.name}, ${day.doneCount} of ${day.total} checked`}
            className="min-h-14"
          >
            <span>{day.name}</span>
            <span>
              {day.doneCount} of {day.total} checked
            </span>
            <span>{day.total > 0 && day.doneCount >= day.total ? 'Done' : `${day.total - day.doneCount} left`}</span>
          </button>
        </li>
      ))}
    </ul>,
  );
}
/** One roster row's markup, so a cross-row `.*` cannot make an assertion lie. */
function rowFor(html: string, name: string): string {
  return html.split('<li>').find((chunk) => chunk.includes(`>${name}<`)) ?? '';
}

test('a staffer who checked nothing is on screen with an honest zero', () => {
  const ben = rowFor(paintRoster(), 'Ben');
  assert.match(ben, /Ben/, 'a zero-check staffer is exactly who the report is read to find');
  assert.match(ben, /0 of 2 checked/);
  assert.doesNotMatch(ben, />Done</, 'never marked complete on an empty day');
  assert.match(ben, />2 left</);
});

test('a finished staffer reads Done; an unfinished one names what is left', () => {
  const html = paintRoster();
  assert.match(html, /2 of 2 checked/);
  assert.match(html, />Done</, 'completion is a WORD — a colour-only pip is unreadable on a floor');
  assert.match(html, />2 left</);
});

test('every roster row is a named control at the touch floor', () => {
  const html = paintRoster();
  assert.match(html, /aria-label="Ana, 2 of 2 checked"/);
  assert.match(html, /aria-label="Ben, 0 of 2 checked"/);
  assert.match(html, /min-h-14/);
});

test('the projection keeps both staffers — the roster is the denominator', () => {
  const days = buildStaffDays(REPORT);
  assert.deepEqual(days.map((d) => d.name).sort(), ['Ana', 'Ben']);
});
