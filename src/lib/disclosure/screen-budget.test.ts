/** The screen budget: declarations obey the law, and a measured screen is held to its declaration. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkScreenSnapshot,
  checkSurfaceSpec,
  disclosureLists,
  type ScreenSnapshot,
  type SurfaceDisclosureSpec,
} from './screen-budget';
import { DISCLOSURE_SURFACES } from './surfaces';

const spec: SurfaceDisclosureSpec = {
  id: 'fixture',
  surface: 'phone',
  file: 'x.tsx',
  owner: 'fixture',
  probe: { path: '/m/x', params: {}, ready: 'body' },
  chromeRow: ['title', 'more', 'close'],
  cornerRow: { left: 'status', right: 'due' },
  rows: [['people?']],
  dock: ['primary'],
  doors: { status: ['quick-slider'], more: ['add-person'] },
};

const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

function snap(overrides: Partial<ScreenSnapshot> = {}): ScreenSnapshot {
  return {
    viewport: { width: 390, height: 844 },
    slots: {
      title: rect(16, 14, 240, 70),
      more: rect(282, 4, 44, 44),
      close: rect(334, 4, 44, 44),
      status: rect(16, 92, 120, 44),
      due: rect(250, 92, 124, 44),
    },
    titleFirstLine: rect(16, 14, 220, 20),
    l1Height: 180,
    l1Controls: [
      { name: 'More', slot: 'more' },
      { name: 'Close task', slot: 'close' },
    ],
    texts: [],
    targets: [],
    ...overrides,
  };
}

test('every declared surface is within its own law', () => {
  for (const surface of DISCLOSURE_SURFACES) assert.deepEqual(checkSurfaceSpec(surface), [], surface.id);
});

test('a second control for one fact on the first screen is a DELETE', () => {
  const findings = checkSurfaceSpec({ ...spec, rows: [['quick-slider']] });
  assert.deepEqual(findings.map((f) => [f.rule, f.remedy]), [['one-fact-one-place', 'delete']]);
});

test('the chrome row must end with close and doors must open from L1', () => {
  const rules = checkSurfaceSpec({ ...spec, chromeRow: ['close', 'title'], doors: { timer: ['ring'] } }).map((f) => f.rule);
  assert.deepEqual(rules.sort(), ['chrome-row', 'door-declared']);
});

test('the dock holds one primary', () => {
  const rules = checkSurfaceSpec({ ...spec, dock: ['media', 'share', 'archive', 'primary'] }).map((f) => f.rule);
  assert.deepEqual(rules, ['dock-budget']);
  assert.deepEqual(checkSurfaceSpec({ ...spec, dock: ['media'] }).map((f) => f.rule), ['dock-budget']);
});

test('a compliant screen has no findings', () => {
  assert.deepEqual(checkScreenSnapshot(spec, snap()), []);
});

test('the close button off the title row, or off the right edge, is a MOVE', () => {
  const low = checkScreenSnapshot(spec, snap({ slots: { ...snap().slots, close: rect(334, 60, 44, 44) } }));
  assert.equal(low[0]?.rule, 'chrome-row');
  assert.equal(low[0]?.remedy, 'move');
  const inset = checkScreenSnapshot(spec, snap({ slots: { ...snap().slots, close: rect(280, 4, 44, 44) } }));
  assert.equal(inset[0]?.rule, 'chrome-row');
});

test('status must be top-left and the time top-right, on one row', () => {
  const swapped = snap({ slots: { ...snap().slots, status: rect(250, 92, 120, 44), due: rect(16, 92, 124, 44) } });
  assert.ok(checkScreenSnapshot(spec, swapped).some((f) => f.rule === 'corner-row'));
  const stacked = snap({ slots: { ...snap().slots, due: rect(250, 150, 124, 44) } });
  assert.ok(checkScreenSnapshot(spec, stacked).some((f) => f.rule === 'corner-row'));
});

test('the title painted again below it is a DELETE; one list repeating a row title is not', () => {
  const texts = [
    { text: 'Sales follow-ups', zone: 'l1', isLabel: false },
    { text: 'Sales follow-ups', zone: 'body', isLabel: false },
    { text: 'Replied on the ticket', zone: 'body', isLabel: false },
    { text: 'Replied on the ticket', zone: 'body', isLabel: false },
  ];
  const findings = checkScreenSnapshot(spec, snap({ texts }));
  assert.deepEqual(findings.map((f) => f.rule), ['duplicate-text']);
  assert.match(findings[0]!.detail, /Sales follow-ups/);
});

test('field labels on L1, controls outside a slot, small targets and a tall L1 land in their lists', () => {
  const findings = checkScreenSnapshot(
    spec,
    snap({
      texts: [{ text: 'Status', zone: 'l1', isLabel: false }],
      l1Controls: [{ name: 'Quick status: Done', slot: null }],
      targets: [{ name: 'Start focus', width: 89, height: 32 }],
      l1Height: 400,
    }),
  );
  const lists = disclosureLists(findings);
  assert.deepEqual(lists.delete.map((f) => f.rule), ['field-label']);
  assert.deepEqual(lists.simplify.map((f) => f.rule).sort(), ['l1-height', 'undeclared-control']);
  assert.deepEqual(lists.enlarge.map((f) => f.rule), ['tap-target']);
});

test('a required slot that does not render is reported; an optional one is not', () => {
  const { more: _more, ...rest } = snap().slots;
  const findings = checkScreenSnapshot(spec, snap({ slots: rest }));
  assert.deepEqual(findings.map((f) => f.rule), ['slot-missing']);
});
