/**
 * Window-manipulation hotkeys — the pure half.
 *
 * `resolveCanvasHotkey` is a total function from a key chord to a canvas
 * command, so the whole binding table is provable with `npx tsx --test` and the
 * React hook above it does nothing but call this and dispatch.
 *
 * ## Why `event.code` and not `event.key`
 *
 * Every binding here carries Option/Alt, and on macOS Option rewrites `key`:
 * `Alt+W` arrives as `∑`, `Alt+1` as `¡`, `Alt+\` as `«`. `segment-chords.ts`
 * already hit this and already resolved it the same way ("prefer `code` — on
 * macOS Alt+1 often yields `¡`"). `code` is the physical key, so the table is
 * one table on both platforms.
 *
 * ## Why `Mod+Alt`
 *
 * The bare chords are taken and each one is load-bearing:
 *
 * ```
 *   Mod+K            command bar
 *   Mod+;            nav leader          (nav-leader-store.ts)
 *   Mod+Digit        pinned quick access (pin-hotkeys.ts)
 *   Mod+Shift+V / U  clipboard / throw-task hosts
 *   Alt+Digit1…3     segment perspective (segment-chords.ts)
 * ```
 *
 * `Mod+Alt+…` collides with none of them, and every listener above explicitly
 * bails when the modifier set does not match exactly, so adding this layer
 * cannot shadow one of them.
 *
 * ## Wedge safety
 *
 * A barcode wedge types bare characters at machine speed with no modifiers. Every
 * binding here requires BOTH `Mod` and `Alt`, so no scan can ever reach this
 * table — the same property `segment-chords.ts` relies on. The caller is still
 * responsible for ignoring chords while an editable element has focus
 * (`isEditableKeyTarget`); that is a focus question, not a binding question.
 */

import type { CanvasOrientation, CanvasDirection } from '@/lib/canvas/layout';
import type { CanvasPresetId } from '@/lib/canvas/presets';

/**
 * The structural subset of `KeyboardEvent` the resolver reads. A real
 * `KeyboardEvent` satisfies it, and a test can write one as an object literal.
 */
export interface CanvasKeyChord {
  readonly code: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly repeat?: boolean;
}

export type CanvasCommand =
  /** Move focus to the tile in this direction. */
  | { readonly kind: 'focus-direction'; readonly direction: CanvasDirection }
  /** Send the active tab to the tile in this direction, creating one if needed. */
  | { readonly kind: 'move-direction'; readonly direction: CanvasDirection }
  /** Split the focused tile, opening an empty pane beside/below it. */
  | { readonly kind: 'split'; readonly orientation: CanvasOrientation }
  /** Close the focused PANE (its tabs stay open and are re-homed). */
  | { readonly kind: 'close-pane' }
  /** Zoom the focused tile to the whole canvas, or restore it. */
  | { readonly kind: 'toggle-maximize' }
  /** Reset every sash to centre. */
  | { readonly kind: 'even-out' }
  /** Apply a saved arrangement. */
  | { readonly kind: 'preset'; readonly presetId: CanvasPresetId }
  /** Next / previous tab WITHIN the focused pane. */
  | { readonly kind: 'cycle-tab'; readonly delta: 1 | -1 };

const DIRECTION_BY_CODE: Readonly<Record<string, CanvasDirection>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

/**
 * **The digit is the pane count.** `1` is one pane, `2` is two side by side, `3`
 * is the triptych, `4` is the quad — so the binding is not a list to memorize,
 * it is the thing itself. `stack` is deliberately not on a digit: it is a
 * two-pane arrangement like `compare`, and the split-down chord already produces
 * it directly.
 *
 * Digit `0` is "even out" rather than a fifth preset — it is the reset, and the
 * key at the end of the row is where every tiling window manager puts one.
 */
const PRESET_BY_CODE: Readonly<Record<string, CanvasPresetId>> = {
  Digit1: 'focus',
  Digit2: 'compare',
  Digit3: 'triptych',
  Digit4: 'quad',
};

/** `Mod` is ⌘ on Apple hardware and Ctrl elsewhere — either satisfies it. */
function hasMod(chord: CanvasKeyChord): boolean {
  return chord.metaKey || chord.ctrlKey;
}

/**
 * The one entry point. Returns `null` for anything that is not a canvas chord,
 * including auto-repeat (a held arrow would fling focus across the canvas
 * faster than an operator can read where it went).
 */
export function resolveCanvasHotkey(chord: CanvasKeyChord): CanvasCommand | null {
  if (!hasMod(chord) || !chord.altKey) return null;
  if (chord.repeat) return null;

  const direction = DIRECTION_BY_CODE[chord.code];
  if (direction) {
    return chord.shiftKey
      ? { kind: 'move-direction', direction }
      : { kind: 'focus-direction', direction };
  }

  if (chord.shiftKey) return null;

  switch (chord.code) {
    // `Ctrl+\` is VS Code's split; keeping the physical key keeps the muscle
    // memory and only adds the Alt this app needs to stay off the taken chords.
    case 'Backslash':
      return { kind: 'split', orientation: 'row' };
    case 'Minus':
      return { kind: 'split', orientation: 'column' };
    case 'KeyW':
      return { kind: 'close-pane' };
    case 'Enter':
    case 'NumpadEnter':
      return { kind: 'toggle-maximize' };
    case 'Digit0':
      return { kind: 'even-out' };
    case 'BracketLeft':
      return { kind: 'cycle-tab', delta: -1 };
    case 'BracketRight':
      return { kind: 'cycle-tab', delta: 1 };
    default:
      break;
  }

  const presetId = PRESET_BY_CODE[chord.code];
  if (presetId) return { kind: 'preset', presetId };

  return null;
}

/** Apple-platform glyphs for a hint face — never a hand-typed twin per surface. */
function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ||
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
      ?.platform === 'macOS'
  );
}

/**
 * Printable face for a canvas chord, e.g. `⌘⌥\` / `Ctrl+Alt+\`. One producer, so
 * a tooltip and the listener can never drift — the same contract
 * `segmentChordHint` established.
 */
export function canvasHotkeyHint(tail: string, opts?: { shift?: boolean }): string {
  const apple = isApplePlatform();
  const shift = opts?.shift ? (apple ? '⇧' : 'Shift+') : '';
  return apple ? `⌘⌥${shift}${tail}` : `Ctrl+Alt+${shift}${tail}`;
}
