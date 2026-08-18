/**
 * Source guard for the per-unit condition route
 * (docs/todo/per-unit-no-serial-EXECUTION-PROMPT.md §4 Phase 4).
 *
 * Pins: stamps `receiving_line_unit.condition_grade` only (not the line-level
 * testing fact, not serial_units), gated with withAuth, parses both ids.
 *
 * Run: node --test --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        src/app/api/receiving/lines/units-condition.guard.test.ts
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

const ROUTE = code(sourceOf('./[id]/units/[unitId]/condition/route.ts'));

test('per-unit condition route is gated with withAuth', () => {
  assert.match(ROUTE, /export const PATCH = withAuth\(/);
});

test('per-unit condition route updates receiving_line_unit.condition_grade only', () => {
  assert.match(ROUTE, /UPDATE receiving_line_unit/);
  assert.match(ROUTE, /SET condition_grade/);
  assert.doesNotMatch(ROUTE, /receiving_line_testing/);
  assert.doesNotMatch(ROUTE, /UPDATE serial_units/);
});

test('per-unit condition route parses both line id and unit id from the pathname', () => {
  assert.match(ROUTE, /indexOf\('lines'\)/);
  assert.match(ROUTE, /indexOf\('units'\)/);
  assert.match(ROUTE, /invalid line id/);
  assert.match(ROUTE, /invalid unit id/);
});

test('per-unit condition route accepts null to clear the grade', () => {
  assert.match(ROUTE, /clearing/);
  assert.match(ROUTE, /null to clear/);
  assert.match(ROUTE, /nextGrade/);
});
