/**
 * The window-manipulation binding table, pinned.
 *
 * The two properties worth a test are not the individual bindings — they are
 * that a barcode can never reach this table, and that it cannot shadow a chord
 * that is already load-bearing somewhere else in the app.
 *
 * Run: `npx tsx --test src/lib/canvas/hotkeys.test.ts`
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveCanvasHotkey, type CanvasKeyChord } from './hotkeys';

const NONE = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };

function chord(partial: Partial<CanvasKeyChord> & { code: string }): CanvasKeyChord {
  return { ...NONE, ...partial };
}

/** The canvas modifier set: Mod (⌘ or Ctrl) + Alt. */
function mod(code: string, extra: Partial<CanvasKeyChord> = {}): CanvasKeyChord {
  return chord({ code, metaKey: true, altKey: true, ...extra });
}

describe('resolveCanvasHotkey — the bindings', () => {
  it('arrows move focus; shift+arrows move the tab', () => {
    assert.deepEqual(resolveCanvasHotkey(mod('ArrowRight')), {
      kind: 'focus-direction',
      direction: 'right',
    });
    assert.deepEqual(resolveCanvasHotkey(mod('ArrowUp')), {
      kind: 'focus-direction',
      direction: 'up',
    });
    assert.deepEqual(resolveCanvasHotkey(mod('ArrowLeft', { shiftKey: true })), {
      kind: 'move-direction',
      direction: 'left',
    });
  });

  it('splits, close, zoom, even-out and tab cycling', () => {
    assert.deepEqual(resolveCanvasHotkey(mod('Backslash')), { kind: 'split', orientation: 'row' });
    assert.deepEqual(resolveCanvasHotkey(mod('Minus')), { kind: 'split', orientation: 'column' });
    assert.deepEqual(resolveCanvasHotkey(mod('KeyW')), { kind: 'close-pane' });
    assert.deepEqual(resolveCanvasHotkey(mod('Enter')), { kind: 'toggle-maximize' });
    assert.deepEqual(resolveCanvasHotkey(mod('NumpadEnter')), { kind: 'toggle-maximize' });
    assert.deepEqual(resolveCanvasHotkey(mod('Digit0')), { kind: 'even-out' });
    assert.deepEqual(resolveCanvasHotkey(mod('BracketRight')), { kind: 'cycle-tab', delta: 1 });
    assert.deepEqual(resolveCanvasHotkey(mod('BracketLeft')), { kind: 'cycle-tab', delta: -1 });
  });

  it('the digit IS the pane count; 0 is the reset, not a fifth preset', () => {
    assert.deepEqual(resolveCanvasHotkey(mod('Digit1')), { kind: 'preset', presetId: 'focus' });
    assert.deepEqual(resolveCanvasHotkey(mod('Digit2')), { kind: 'preset', presetId: 'compare' });
    assert.deepEqual(resolveCanvasHotkey(mod('Digit3')), { kind: 'preset', presetId: 'triptych' });
    assert.deepEqual(resolveCanvasHotkey(mod('Digit4')), { kind: 'preset', presetId: 'quad' });
    assert.deepEqual(resolveCanvasHotkey(mod('Digit0')), { kind: 'even-out' });
    assert.equal(resolveCanvasHotkey(mod('Digit5')), null);
  });

  it('Ctrl satisfies Mod as well as ⌘ — one table on both platforms', () => {
    assert.deepEqual(resolveCanvasHotkey(chord({ code: 'KeyW', ctrlKey: true, altKey: true })), {
      kind: 'close-pane',
    });
  });
});

describe('resolveCanvasHotkey — what it must never claim', () => {
  it('a barcode wedge cannot reach it: every binding needs BOTH Mod and Alt', () => {
    // A wedge types bare characters at machine speed with no modifiers.
    for (const code of ['KeyW', 'Digit1', 'Digit0', 'Minus', 'Backslash', 'Enter']) {
      assert.equal(resolveCanvasHotkey(chord({ code })), null, `bare ${code} must not bind`);
      assert.equal(
        resolveCanvasHotkey(chord({ code, shiftKey: true })),
        null,
        `shifted ${code} must not bind`,
      );
    }
  });

  it('does not shadow the chords that are already load-bearing elsewhere', () => {
    // Alt+Digit1…3 is segment-chords.ts; Mod+Digit is pin-hotkeys.ts;
    // Mod+K is the command bar; Mod+Shift+V/U are the quick-access hosts.
    assert.equal(resolveCanvasHotkey(chord({ code: 'Digit1', altKey: true })), null);
    assert.equal(resolveCanvasHotkey(chord({ code: 'Digit1', metaKey: true })), null);
    assert.equal(resolveCanvasHotkey(chord({ code: 'KeyK', metaKey: true })), null);
    assert.equal(
      resolveCanvasHotkey(chord({ code: 'KeyV', metaKey: true, shiftKey: true })),
      null,
    );
    assert.equal(resolveCanvasHotkey(chord({ code: 'Semicolon', metaKey: true })), null);
  });

  it('ignores auto-repeat so a held arrow cannot fling focus across the canvas', () => {
    assert.equal(resolveCanvasHotkey(mod('ArrowRight', { repeat: true })), null);
  });

  it('shift only qualifies the arrows — never a letter or a digit', () => {
    assert.equal(resolveCanvasHotkey(mod('KeyW', { shiftKey: true })), null);
    assert.equal(resolveCanvasHotkey(mod('Digit1', { shiftKey: true })), null);
    assert.equal(resolveCanvasHotkey(mod('Backslash', { shiftKey: true })), null);
  });

  it('is total against a key it has never heard of', () => {
    assert.equal(resolveCanvasHotkey(mod('F13')), null);
    assert.equal(resolveCanvasHotkey(mod('')), null);
  });
});
