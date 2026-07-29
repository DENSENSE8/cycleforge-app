/**
 * Source guard for the per-unit serial-absent route
 * (docs/todo/per-unit-no-serial-EXECUTION-PROMPT.md §4 Phase 3).
 *
 * Pins the contract a future edit would otherwise silently break:
 *   - stamps `receiving_line_unit`, never the line-level testing waiver
 *   - gated with withAuth (mirrors the line-level sibling)
 *   - parses both line id and unit id from the pathname
 *
 * Run: node --test --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        src/app/api/receiving/lines/units-serial-absent.guard.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

/** Strip comments so prose about a call can never satisfy a guard. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const ROUTE = code(sourceOf('./[id]/units/[unitId]/serial-absent/route.ts'));

test('per-unit route is gated with withAuth (session required)', () => {
  assert.match(ROUTE, /export const POST = withAuth\(/);
});

test('per-unit route updates receiving_line_unit, never line-level testing.serial_absent', () => {
  assert.match(ROUTE, /UPDATE receiving_line_unit/);
  assert.doesNotMatch(
    ROUTE,
    /receiving_line_testing/,
    'must not touch the line-level waiver table — that is a separate representation',
  );
});

test('per-unit route parses both line id and unit id from the pathname', () => {
  assert.match(ROUTE, /indexOf\('lines'\)/);
  assert.match(ROUTE, /indexOf\('units'\)/);
  assert.match(ROUTE, /invalid line id/);
  assert.match(ROUTE, /invalid unit id/);
});

test('per-unit route scopes the write to org + line + unit id', () => {
  assert.match(ROUTE, /organization_id = \$1/);
  assert.match(ROUTE, /receiving_line_id = \$2/);
  assert.match(ROUTE, /AND id = \$5/);
});
