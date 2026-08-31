/**
 * React Compiler trap mitigation (grid-surface-descriptor plan § React
 * Compiler trap). Rehomed from `orders-queue-column-defs.test.ts` when that
 * flat-model module died with the Wave-1 hand-model kill — the directive it
 * guards lives HERE, beside `useGridSurface`, not in any family's columns.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

describe('React Compiler trap mitigation (plan § React Compiler trap)', () => {
  it('useGridSurface ships with the "use no memo" directive in its prologue', () => {
    const source = readFileSync(new URL('./useGridSurface.ts', import.meta.url), 'utf8');
    const prologue = source.slice(0, 200);
    assert.ok(
      /^['"]use no memo['"];/m.test(prologue),
      'useGridSurface.ts must open with the "use no memo" directive — removing it lets a future reactCompiler flip freeze the grid on sort/visibility changes',
    );
  });
});
