/**
 * AdminTable contract — the parts that are easy to regress silently.
 *
 * Deliberately a pure-logic test (no DOM render): alignment is derived from the
 * same SoT the ledger grids use. The admin wave this component is built for
 * hand-types `text-right` inside `cell()`, so two count columns in one table
 * can align differently. Deriving from `type` is what stops that; a future edit
 * that re-adds a local ternary breaks these.
 *
 * Run: `npx tsx --test src/design-system/components/AdminTable/AdminTable.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGridColumnAlign } from '../grid/grid-header-align';
import type { ColumnType } from '@/lib/tables/table-columns';

/** Mirrors `columnAlign` in AdminTable.tsx — keep the two in step. */
function expectedAlign(type: ColumnType | undefined, override?: 'left' | 'center' | 'right') {
  if (override) return override;
  if (!type) return 'left';
  return resolveGridColumnAlign({ type }) === 'end' ? 'right' : 'left';
}

test('magnitude columns resolve to end-alignment — number, price, and date', () => {
  for (const type of ['number', 'price', 'date'] as ColumnType[]) {
    assert.equal(expectedAlign(type), 'right', `${type} should end-align`);
  }
});

test('label columns resolve to start-alignment — location, tracking, and id', () => {
  // `location` stayed start on 2026-08-02; `date` rejoined magnitudes 2026-08-03;
  // `id` flipped to start on 2026-08-04 (Law of Strict Alignment — text + IDs left).
  // Admin/settings tables inherit via the same SoT rather than hand-typing align.
  for (const type of ['text', 'longtext', 'tag', 'external', 'location', 'tracking', 'id', 'image'] as ColumnType[]) {
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
