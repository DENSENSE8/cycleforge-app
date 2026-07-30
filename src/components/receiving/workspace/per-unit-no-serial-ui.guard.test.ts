/**
 * Source guard: multi-qty empty Serial rows get the green no-serial check
 * only when materialised `units` reach UnitSlotList. Pins the plumbing that
 * was dropping units (panel `row.units` instead of accordion SoT; serials-only
 * hydration overlay).
 *
 * Plan: docs/todo/per-unit-no-serial-EXECUTION-PROMPT.md §4 Phase 3 UI.
 *
 * Run: node --test --import tsx \
 *        src/components/receiving/workspace/per-unit-no-serial-ui.guard.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const TYPES = code(sourceOf('./po-lines-accordion-types.ts'));
const PO_LINE_ROW = code(sourceOf('./PoLineRow.tsx'));
const LINE_PO_ITEMS = code(sourceOf('./line-edit/LinePoItemsSection.tsx'));
const UNMATCHED = code(sourceOf('./unmatched-items/UnmatchedAccordionSurface.tsx'));
const PO_LINES_DATA = code(sourceOf('./hooks/usePoLinesData.ts'));
const LINE_SERIALS = code(sourceOf('./line-edit/hooks/useLineSerials.ts'));
const PUBLISH = code(
  sourceOf('../../../lib/queries/receiving-queries.ts'),
);

test('ActiveRowSlotContext carries units alongside serials', () => {
  assert.match(TYPES, /export interface ActiveRowSlotContext/);
  assert.match(TYPES, /serials:\s*ActiveRowSerial\[\]/);
  assert.match(TYPES, /units:\s*ReceivingLineUnitView\[\]/);
});

test('PoLineRow passes units from the hydrated accordion line into activeRowSlot', () => {
  assert.match(PO_LINE_ROW, /activeRowSlot\(\{[\s\S]*units:\s*line\.units/);
  assert.match(PO_LINE_ROW, /serials:\s*line\.serials/);
});

test('LinePoItemsSection feeds ActiveLineConditionSerial units from slot context, not panel row', () => {
  assert.match(LINE_PO_ITEMS, /activeRowSlot=\{\(\{\s*serials,\s*units\s*\}\)/);
  assert.match(LINE_PO_ITEMS, /units=\{units\}/);
  assert.doesNotMatch(
    LINE_PO_ITEMS,
    /units=\{row\.units/,
    'panel row.units is usually unhydrated table data — must not drive the green check',
  );
});

test('UnmatchedAccordionSurface also passes slot units into ActiveLineConditionSerial', () => {
  assert.match(UNMATCHED, /activeRowSlot=\{\(\{\s*serials,\s*units\s*\}\)/);
  assert.match(UNMATCHED, /units=\{units\}/);
});

test('usePoLinesData overlays units from include=serials onto the siblings cache', () => {
  assert.match(PO_LINES_DATA, /units:\s*\(r\.units/);
  assert.match(PO_LINES_DATA, /units:\s*incoming\.units/);
  assert.match(PO_LINES_DATA, /prevUnits/);
});

test('useLineSerials refresh publishes units from the by-id include=serials response', () => {
  assert.match(
    LINE_SERIALS,
    /publishLineSerials\(\s*queryClient,[\s\S]*line\.serials\s*\?\?\s*\[\],\s*line\.units\s*\?\?\s*\[\],\s*\)/,
  );
});

test('publishLineSerials accepts optional units without wiping them on serial-only calls', () => {
  assert.match(PUBLISH, /export function publishLineSerials\(/);
  assert.match(PUBLISH, /units\?:/);
  assert.match(PUBLISH, /units !== undefined/);
});
