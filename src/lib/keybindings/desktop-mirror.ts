/**
 * Renderer half of mirroring keybindings to the Electron main process.
 *
 * ## Why this matters, and why it is not optional
 *
 * `globalShortcut` in `electron/main.js` binds exactly one key — `Insert`, the
 * scan reclaim — and its own comment states the gap:
 *
 * > *"Limitation (documented, not silent): this binds the DEFAULT `Insert`. A
 * > staff override stored in the renderer is not mirrored to the shell yet."*
 *
 * Until now there was nothing to mirror FROM: 56 hand-rolled `keydown`
 * listeners cannot be enumerated, so the shell could not have been told about
 * them even in principle. With a registry there is a list, and the consequence
 * of not sending it is concrete: a renderer `keydown` listener only fires while
 * the window has focus, so every custom chord dies the moment an operator
 * clicks a vendor `WebContentsView`, a print dialog, or another app — which on
 * a warehouse bench is most of the shift.
 *
 * ## This module is PURE, on purpose
 *
 * It converts chords to Electron accelerator strings and nothing else. The
 * bridge call belongs in `@/lib/desktop/desktop-host` — the ONE module in
 * `src/` allowed to name `window.cycleForgeDesktop`, so a capability check can
 * never be re-derived with different semantics per call site. Being pure also
 * means the conversion is testable without Electron, a DOM, or a build.
 *
 * ## An unmappable chord is DROPPED, never approximated
 *
 * Electron's accelerator grammar is not this app's chord grammar (`Up`, not
 * `ArrowUp`; no `Digit1`). A code with no accelerator spelling returns `null`
 * and the binding simply stays renderer-only — an approximate global shortcut
 * would steal a key the operator never asked for, system-wide.
 */

import type { Chord } from '@/lib/keybindings/chord';
import { listKeybindings, resolveChord } from '@/lib/keybindings/registry';

/** `KeyboardEvent.code` → Electron accelerator key name. */
const ACCELERATOR_KEYS: Readonly<Record<string, string>> = Object.freeze({
  Escape: 'Escape',
  Enter: 'Return',
  Space: 'Space',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  // Bare, and reachable: none of these can be typed by a wedge, so a rebinder
  // will legitimately offer them and the shell has to be able to claim them.
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Slash: '/',
  Backslash: '\\',
  Comma: ',',
  Period: '.',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
  NumpadAdd: 'numadd',
  NumpadSubtract: 'numsub',
  NumpadDecimal: 'numdec',
  NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv',
});

/**
 * One chord as an Electron accelerator, or `null` when it has no faithful
 * spelling.
 *
 * `Mod` becomes `CommandOrControl`, which is Electron's own portable modifier
 * and means exactly what `Mod` means here — the one place the two vocabularies
 * agree without a translation table.
 */
export function toElectronAccelerator(chord: Chord): string | null {
  const parts: string[] = [];
  if (chord.mod) parts.push('CommandOrControl');
  if (chord.meta) parts.push('Command');
  if (chord.ctrl) parts.push('Control');
  if (chord.alt) parts.push('Alt');
  if (chord.shift) parts.push('Shift');

  if (chord.kind === 'letter') {
    parts.push(chord.key.toUpperCase());
    return parts.join('+');
  }

  // A PHYSICAL letter code (`KeyP`), which is what `chordFromEvent` produces
  // for an ⌥+letter capture — on macOS ⌥P delivers `key: 'π'`, so the letter
  // has to be carried as its code or the chord cannot be spelled at all. An
  // Electron accelerator names letters the same way either route arrives.
  const letterCode = /^Key([A-Z])$/.exec(chord.key);
  if (letterCode) {
    parts.push(letterCode[1]);
    return parts.join('+');
  }

  const digit = /^Digit([0-9])$/.exec(chord.key);
  if (digit) {
    parts.push(digit[1]);
    return parts.join('+');
  }
  const numpadDigit = /^Numpad([0-9])$/.exec(chord.key);
  if (numpadDigit) {
    parts.push(`num${numpadDigit[1]}`);
    return parts.join('+');
  }
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(chord.key)) {
    parts.push(chord.key);
    return parts.join('+');
  }
  const named = ACCELERATOR_KEYS[chord.key];
  if (named) {
    parts.push(named);
    return parts.join('+');
  }
  return null;
}

export interface DesktopKeybinding {
  /** The registry id, so the shell can report which binding it failed to claim. */
  readonly id: string;
  readonly accelerator: string;
}

/**
 * Every currently-resolved binding as an accelerator list, ready to hand the
 * shell. Disabled bindings (`override: null`) and unmappable chords are absent
 * — the list says what the shell should claim, and nothing else.
 */
export function serializeKeybindingsForDesktop(): readonly DesktopKeybinding[] {
  const out: DesktopKeybinding[] = [];
  for (const binding of listKeybindings()) {
    const chord = resolveChord(binding.id);
    if (!chord) continue;
    const accelerator = toElectronAccelerator(chord);
    if (!accelerator) continue;
    out.push({ id: binding.id, accelerator });
  }
  return Object.freeze(out);
}
