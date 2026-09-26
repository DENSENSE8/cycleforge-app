/** Render-contract — the Daily row model (`src/features/home/grid/`). */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyTaskRows } from './daily-task-row';
import type { DailyCheckItem } from '@/lib/daily-checks/types';
import { buildDailyCheckReport } from '@/lib/daily-checks/report';

function item(overrides: Partial<DailyCheckItem> = {}): DailyCheckItem {
  return {
    id: 7,
    title: 'Front door locked',
    sortOrder: 0,
    kind: 'recurring',
    assignedStaffId: null,
    assignedStaffName: null,
    glyph: null,
    ...overrides,
  };
}

/** The real read model builds the report — no hand-cast shape can drift. */
const REPORT = buildDailyCheckReport({
  dateKey: '2026-09-14',
  items: [item()],
  marks: [{ itemId: 7, staffId: 10, markedAt: '2026-09-14T15:00:00.000Z', note: null }],
  roster: [
    { staffId: 10, name: 'Ana' },
    { staffId: 20, name: 'Sam' },
  ],
  viewerStaffId: 10,
});

test('an unowned item denominates over the roster', () => {
  const [row] = buildDailyTaskRows([item()], REPORT, new Set());
  assert.equal(row.teamTotal, 2);
  assert.equal(row.teamDone, 1, 'Ana ticked it, Sam did not');
});

test('an owned item denominates over its owner alone', () => {
  const [row] = buildDailyTaskRows(
    [item({ kind: 'once', assignedStaffId: 10, assignedStaffName: 'Ana' })],
    REPORT,
    new Set(),
  );
  assert.equal(row.teamTotal, 1);
  assert.equal(row.kind, 'once');
  assert.equal(row.assignedStaffName, 'Ana');
});

test('a glyph prefixes the title; no glyph paints the bare title', () => {
  const [withGlyph, bare] = buildDailyTaskRows(
    [item({ id: 1, glyph: '📦' }), item({ id: 2 })],
    REPORT,
    new Set(),
  );
  assert.equal(withGlyph.title, '📦 Front door locked');
  assert.equal(bare.title, 'Front door locked');
});

test('no report is a valid frame — zero denominator, ticks preserved', () => {
  const [row] = buildDailyTaskRows([item()], undefined, new Set([7]));
  assert.equal(row.teamTotal, 0);
  assert.equal(row.done, true, 'the optimistic tick survives a reportless frame');
});
