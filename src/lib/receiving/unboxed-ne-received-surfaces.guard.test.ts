/**
 * Unboxed ≠ Received — surfaces beyond the rail Received meter:
 *   1. Qty tips say "counted", never "received" (GridQtyFractionValue)
 *   2. Triage/read-only uses ScannedBadge; ProgressBadge never says "received"
 *   3. getStatusDotBg emerald is stage-only — not qty-complete while UNBOXED
 *
 * Rail meter wiring: `rail/rail-received-qty.guard.test.ts`
 * SoT: source-of-truth.md → Unboxed ≠ Received
 *
 * Run: `npx tsx --test src/lib/receiving/unboxed-ne-received-surfaces.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getStatusDotBg } from '@/components/station/receiving-constants';
import { floorQtyFractionTip } from '@/lib/receiving/rail/quantity';

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const GRID_CELLS = code(sourceOf('../../components/ui/grid-cells.tsx'));
const PO_BADGES = code(sourceOf('../../components/receiving/workspace/PoLineBadges.tsx'));
const PO_LINE_ROW = code(sourceOf('../../components/receiving/workspace/PoLineRow.tsx'));
const STATUS_DOT = code(sourceOf('../../components/station/receiving-constants.ts'));
const QUANTITY = code(sourceOf('./rail/quantity.tsx'));

// ── 1. Qty tip language ────────────────────────────────────────────────────

test('floorQtyFractionTip never uses the word received', () => {
  assert.equal(floorQtyFractionTip(1, 1), '1 of 1 counted');
  assert.doesNotMatch(floorQtyFractionTip(0, 2), /received/i);
  assert.doesNotMatch(floorQtyFractionTip(3, null), /received/i);
});

test('GridQtyFractionValue default tip is floorQtyFractionTip', () => {
  assert.match(GRID_CELLS, /import\s*\{\s*floorQtyFractionTip\s*\}/);
  assert.match(GRID_CELLS, /tooltip\s*\?\?\s*floorQtyFractionTip\s*\(/);
  assert.doesNotMatch(
    GRID_CELLS,
    /of \$\{expected\} received|received · expected/,
    'must not hardcode Received tip copy on Qty fractions',
  );
});

test('quantity.tsx exports floorQtyFractionTip', () => {
  assert.match(QUANTITY, /export\s+function\s+floorQtyFractionTip/);
});

// ── 2. ScannedBadge vs ProgressBadge ───────────────────────────────────────

test('ProgressBadge copy uses counted, never received', () => {
  assert.match(PO_BADGES, /\{received\}\s*counted/);
  assert.doesNotMatch(
    PO_BADGES,
    /\{received\}\s*received/,
    'ProgressBadge must not paint the inventory noun Received for floor qty',
  );
});

test('PoLineRow: readOnly → ScannedBadge; interactive → ProgressBadge', () => {
  assert.match(
    PO_LINE_ROW,
    /readOnly\s*\?\s*\([\s\S]*?<ScannedBadge[\s\S]*?\)\s*:\s*\([\s\S]*?<ProgressBadge/,
    'triage/read-only must keep ScannedBadge (door scan); never ProgressBadge floor 0/1',
  );
});

// ── 3. Status-dot emerald is stage-only ────────────────────────────────────

test('getStatusDotBg: UNBOXED at qty 1/1 stays indigo (not emerald)', () => {
  assert.equal(getStatusDotBg('UNBOXED', 1, 1), 'bg-indigo-500');
  assert.equal(getStatusDotBg('MATCHED', 1, 1), 'bg-blue-500');
  assert.equal(getStatusDotBg('DONE', 1, 1), 'bg-emerald-500');
  assert.equal(getStatusDotBg('PASSED', 0, 1), 'bg-emerald-500');
});

test('getStatusDotBg source has no qty-complete emerald shortcut', () => {
  const fnStart = STATUS_DOT.indexOf('function getStatusDotBg');
  assert.ok(fnStart >= 0);
  const fnBody = STATUS_DOT.slice(fnStart, fnStart + 1200);
  assert.doesNotMatch(
    fnBody,
    /qtyReceived\s*>=\s*qtyExpected|qtyReceived\s*!=\s*null[\s\S]{0,80}bg-emerald/,
    'qty-complete must not paint emerald ahead of lifecycle stage',
  );
});
