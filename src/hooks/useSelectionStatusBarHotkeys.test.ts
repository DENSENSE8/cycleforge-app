/**
 * Selection status-bar hotkeys — bind + `?` reveal store.
 *
 * Run: node --import tsx --test src/hooks/useSelectionStatusBarHotkeys.test.ts
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  getSelectionInlineHotkeysRevealed,
  isSelectionInlineHotkeySurfaceActive,
  registerSelectionInlineHotkeySurface,
  setSelectionInlineHotkeysRevealed,
  toggleSelectionInlineHotkeys,
} from './useSelectionStatusBarHotkeys';

const HERE = dirname(fileURLToPath(import.meta.url));

describe('useSelectionStatusBarHotkeys', () => {
  it('owns bind + `?` reveal in one module', () => {
    const src = readFileSync(join(HERE, 'useSelectionStatusBarHotkeys.ts'), 'utf8');
    assert.match(src, /window\.addEventListener\('keydown'/);
    assert.match(src, /e\.key !== '\?'/);
    assert.match(src, /e\.repeat/);
    assert.match(src, /shouldSuppressSelectionQuestionMark/);
    assert.match(src, /export function toggleSelectionInlineHotkeys/);
    assert.match(src, /closeShortcutOverview/);
    assert.doesNotMatch(src, /toggleShortcutOverview/);
  });

  it('surface register + reveal + teardown; toggle no-ops without a surface', () => {
    setSelectionInlineHotkeysRevealed(false);
    assert.equal(isSelectionInlineHotkeySurfaceActive(), false);

    toggleSelectionInlineHotkeys();
    assert.equal(getSelectionInlineHotkeysRevealed(), false);

    const off = registerSelectionInlineHotkeySurface();
    assert.equal(isSelectionInlineHotkeySurfaceActive(), true);
    toggleSelectionInlineHotkeys();
    assert.equal(getSelectionInlineHotkeysRevealed(), true);
    off();
    assert.equal(isSelectionInlineHotkeySurfaceActive(), false);
    assert.equal(getSelectionInlineHotkeysRevealed(), false);
  });

  it('re-export seam still resolves', () => {
    assert.ok(existsSync(join(HERE, '../lib/selection/selection-inline-hotkeys.ts')));
  });
});
