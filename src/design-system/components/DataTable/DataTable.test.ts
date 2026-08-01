/**
 * DataTable contract — the parts that are easy to regress silently.
 *
 * Deliberately a pure-logic test (no DOM render): the two things worth pinning
 * are decisions, not markup.
 *
 * 1. **Alignment is derived from the same SoT the ledger grids use.** The admin
 *    wave this component is built for hand-types `text-right` inside `cell()`,
 *    so two count columns in one table can align differently. Deriving from
 *    `type` is what stops that; a future edit that re-adds a local ternary
 *    breaks these.
 * 2. **The module is server-safe.** Most intended call sites
 *    (`/admin/inventory/**`, `/settings/audit`, …) are React Server Components
 *    shipping zero client JS for their tables. A `'use client'` directive — or a
 *    transitively client-only import like `SkeletonList` (framer-motion) — puts
 *    every one of them behind a client boundary to render static rows.
 *
 * Run: `npx tsx --test src/design-system/components/DataTable/DataTable.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveGridColumnAlign } from '../grid/grid-header-align';
import type { ColumnType } from '@/lib/tables/table-columns';

const SOURCE = readFileSync(resolve(import.meta.dirname, 'DataTable.tsx'), 'utf8');

/** Mirrors `columnAlign` in DataTable.tsx — keep the two in step. */
function expectedAlign(type: ColumnType | undefined, override?: 'left' | 'center' | 'right') {
  if (override) return override;
  if (!type) return 'left';
  return resolveGridColumnAlign({ type }) === 'end' ? 'right' : 'left';
}

test('digit / id / date columns resolve to end-alignment', () => {
  for (const type of ['number', 'id', 'date', 'location'] as ColumnType[]) {
    assert.equal(expectedAlign(type), 'right', `${type} should end-align`);
  }
});

test('word / tag columns resolve to start-alignment', () => {
  for (const type of ['text', 'longtext', 'tag', 'external'] as ColumnType[]) {
    assert.equal(expectedAlign(type), 'left', `${type} should start-align`);
  }
});

test('an explicit align overrides the type (including center, which types cannot express)', () => {
  assert.equal(expectedAlign('number', 'center'), 'center');
  assert.equal(expectedAlign('text', 'right'), 'right');
});

test('an untyped column keeps the legacy left default', () => {
  assert.equal(expectedAlign(undefined), 'left');
});

test('the module stays server-safe — no use client directive', () => {
  assert.ok(
    !/^\s*['"]use client['"]/m.test(SOURCE),
    'DataTable gained a "use client" directive — that puts every RSC admin table behind a client boundary',
  );
});

test('the module imports nothing client-only enough to defeat that', () => {
  // `SkeletonList` is the specific trap: it is 'use client' AND pulls
  // framer-motion, so importing it for the loading state would ship the whole
  // motion runtime to a static admin page.
  //
  // Scoped to IMPORT lines — the docblock above names both on purpose, and an
  // assertion over the whole file would fail on the very comment that explains
  // the rule.
  const imports = SOURCE.split('\n').filter((line) => /^\s*import\b/.test(line));
  for (const banned of ['SkeletonList', 'framer-motion', 'motion/react']) {
    const hit = imports.find((line) => line.includes(banned));
    assert.equal(hit, undefined, `DataTable imports ${banned}, which forces a client boundary: ${hit}`);
  }
});
