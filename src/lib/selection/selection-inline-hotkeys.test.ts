/**
 * Re-export seam — store lives in useSelectionStatusBarHotkeys.
 *
 * Run: node --import tsx --test src/lib/selection/selection-inline-hotkeys.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getSelectionInlineHotkeysRevealed,
  isSelectionInlineHotkeySurfaceActive,
  registerSelectionInlineHotkeySurface,
  setSelectionInlineHotkeysRevealed,
  toggleSelectionInlineHotkeys,
} from './selection-inline-hotkeys';

describe('selection-inline-hotkeys (re-export seam)', () => {
  it('forwards the reveal store', () => {
    assert.equal(typeof toggleSelectionInlineHotkeys, 'function');
    assert.equal(typeof isSelectionInlineHotkeySurfaceActive, 'function');
    assert.equal(typeof registerSelectionInlineHotkeySurface, 'function');
    assert.equal(typeof getSelectionInlineHotkeysRevealed, 'function');
    assert.equal(typeof setSelectionInlineHotkeysRevealed, 'function');
  });
});
