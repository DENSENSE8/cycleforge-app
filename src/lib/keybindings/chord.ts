/**
 * Chord parsing, formatting and matching — pure, dependency-free, no React and
 * no `window`, so it runs under `node --test` with zero setup (same contract as
 * `lib/keyboard/wedge-scan-machine.ts` and `lib/right-rail/panel-store-keyboard.ts`).
 *
 * ## Why a chord TYPE and not another hand-rolled predicate
 *
 * 56 files in this repo mount their own `window` `keydown` listener, and each
 * one re-derives the same four questions inline:
 * `if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;` … `if (e.key.toLowerCase() !== 'v') return;`
 * Written 56 times, the answers drift: some reject `altKey`, most forget to;
 * some read `e.key`, some read `e.code`; two spell the same chord differently
 * in their user-facing label than in their listener. Exactly one key in the
 * whole app is remappable (`pinHotkeyLabel`, ⌘1–9), and it is remappable only
 * in the sense that its slot number moves.
 *
 * A chord is data here, so a binding, its label, and its listener are one
 * declaration that cannot drift, and an override map can retarget it.
 *
 * ## `Mod` is the portable modifier
 *
 * `Mod` = ⌘ on Apple platforms, Ctrl everywhere else — and it MATCHES either at
 * runtime. That is deliberate: warehouse benches run a mix of macOS terminals
 * and Windows/Linux boxes, often with the same operator moving between them,
 * and a binding that only fires on the platform it was authored for is a
 * binding that appears broken. Only spell `Ctrl` or `Meta` explicitly when the
 * distinction is real.
 *
 * ## Digits and punctuation are read off `code`, letters off `key`
 *
 * On macOS, Alt+1 delivers `key: '¡'`; Shift+1 delivers `key: '!'`. Any chord
 * keyed on `e.key` for a digit therefore silently stops matching the moment a
 * modifier changes the character — the bug `segmentChordIndexFromEvent`
 * already documents in-line. Letters are the opposite: `e.code` is
 * `KeyZ` on a QWERTY layout and on a Dvorak one, which is not what the operator
 * pressed. So: letters compare `key.toLowerCase()`, everything else compares
 * `code`.
 */

/** Physical-key classes a chord can name. */
export type ChordKeyKind = 'letter' | 'code';

export interface Chord {
  /**
   * For `kind: 'letter'` — the lowercase letter (`'v'`).
   * For `kind: 'code'` — a `KeyboardEvent.code` (`'Digit1'`, `'Escape'`,
   * `'Slash'`, `'F2'`, `'ArrowUp'`, `'Backslash'`, `'Space'`).
   */
  readonly key: string;
  readonly kind: ChordKeyKind;
  /** ⌘ on Apple, Ctrl elsewhere — matches either. */
  readonly mod: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
  /** Explicit Ctrl, distinct from {@link mod}. */
  readonly ctrl: boolean;
  /** Explicit Meta/⌘, distinct from {@link mod}. */
  readonly meta: boolean;
}

/** The subset of `KeyboardEvent` a chord reads. Keeps matching testable. */
export interface ChordKeyEvent {
  readonly key: string;
  readonly code: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

const MODIFIER_TOKENS: Readonly<Record<string, keyof Chord>> = Object.freeze({
  mod: 'mod',
  cmd: 'meta',
  command: 'meta',
  meta: 'meta',
  ctrl: 'ctrl',
  control: 'ctrl',
  alt: 'alt',
  option: 'alt',
  opt: 'alt',
  shift: 'shift',
});

/**
 * Named keys spelled the friendly way in a spec, mapped to their `code`.
 * Anything not listed and longer than one character is taken as a literal
 * `code`, so `F2` / `ArrowUp` / `Backslash` work without an entry each.
 */
const NAMED_CODES: Readonly<Record<string, string>> = Object.freeze({
  esc: 'Escape',
  escape: 'Escape',
  enter: 'Enter',
  return: 'Enter',
  space: 'Space',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  '/': 'Slash',
  '\\': 'Backslash',
  ',': 'Comma',
  '.': 'Period',
  ';': 'Semicolon',
  "'": 'Quote',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '-': 'Minus',
  '=': 'Equal',
  '`': 'Backquote',
});

/**
 * Parse a spec like `'Mod+Shift+P'`, `'Alt+Digit1'`, `'Mod+\\'`, `'F2'`.
 * Returns `null` for anything unparseable — a caller must decide what to do
 * with a bad spec (the registry warns and drops the binding rather than
 * binding something the operator did not ask for).
 */
export function parseChord(spec: string): Chord | null {
  if (typeof spec !== 'string') return null;
  const trimmed = spec.trim();
  if (!trimmed) return null;

  // `+` is the separator, so it cannot also be a key name. A chord on the plus
  // key is spelled by its `code`: `Mod+Equal` (US layouts print `+` on Shift +
  // `=`) or `Mod+NumpadAdd`. `'Mod++'` therefore parses as nothing, which is
  // the honest answer — silently binding it to `=` would be a chord the
  // operator did not ask for.
  const parts = trimmed.split('+');

  let mod = false;
  let shift = false;
  let alt = false;
  let ctrl = false;
  let meta = false;
  let keyToken: string | null = null;

  for (const raw of parts) {
    const token = raw.trim();
    if (!token) return null;
    const lower = token.toLowerCase();
    const modifier = MODIFIER_TOKENS[lower];
    if (modifier) {
      if (modifier === 'mod') mod = true;
      else if (modifier === 'shift') shift = true;
      else if (modifier === 'alt') alt = true;
      else if (modifier === 'ctrl') ctrl = true;
      else if (modifier === 'meta') meta = true;
      continue;
    }
    // Two key tokens in one spec is a typo, not a chord.
    if (keyToken !== null) return null;
    keyToken = token;
  }

  if (keyToken === null) return null;

  const lowerKey = keyToken.toLowerCase();
  if (/^[a-z]$/.test(lowerKey)) {
    // ⌥+letter is canonicalized to the PHYSICAL key, and this is not a
    // convenience — a letter chord matches on `key.toLowerCase()`, and on macOS
    // ⌥J delivers `key: '∆'`. `{ letter, 'j' }` therefore never fires on an
    // Apple bench, silently, for the life of the binding. Folding the spec to
    // `KeyJ` also means `'Alt+J'` and `'Alt+KeyJ'` are ONE chord to
    // {@link chordId}, so conflict detection sees the collision an operator
    // sees. Every chord without ⌥ keeps matching on `key`, which is where the
    // layout-independence argument in the module header actually applies.
    if (alt) {
      return { key: `Key${lowerKey.toUpperCase()}`, kind: 'code', mod, shift, alt, ctrl, meta };
    }
    return { key: lowerKey, kind: 'letter', mod, shift, alt, ctrl, meta };
  }
  if (/^[0-9]$/.test(lowerKey)) {
    return { key: `Digit${lowerKey}`, kind: 'code', mod, shift, alt, ctrl, meta };
  }
  const named = NAMED_CODES[lowerKey];
  if (named) return { key: named, kind: 'code', mod, shift, alt, ctrl, meta };
  if (keyToken.length > 1) {
    // A literal `KeyboardEvent.code` — `ArrowUp`, `F2`, `NumpadAdd`, `KeyZ`.
    return { key: keyToken, kind: 'code', mod, shift, alt, ctrl, meta };
  }
  return null;
}

/**
 * Canonical identity of a chord, for conflict detection and as a Map key.
 * Two specs that mean the same chord produce the same id, so `'Shift+Mod+p'`
 * and `'Mod+Shift+P'` collide the way an operator expects them to.
 */
export function chordId(chord: Chord): string {
  const flags = [
    chord.mod ? 'mod' : '',
    chord.meta ? 'meta' : '',
    chord.ctrl ? 'ctrl' : '',
    chord.alt ? 'alt' : '',
    chord.shift ? 'shift' : '',
  ].filter(Boolean);
  return [...flags, `${chord.kind}:${chord.key}`].join('+');
}

/** True on macOS / iPadOS, where `Mod` paints as ⌘. SSR-safe (assumes non-Apple). */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  if (nav.userAgentData?.platform === 'macOS') return true;
  return /Mac|iPhone|iPad|iPod/i.test(nav.platform ?? '') ||
    /Mac OS|iPhone|iPad|iPod/i.test(nav.userAgent ?? '');
}

const CODE_FACE: Readonly<Record<string, string>> = Object.freeze({
  Escape: 'Esc',
  Enter: '↵',
  Space: 'Space',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
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
});

function codeFace(code: string): string {
  const named = CODE_FACE[code];
  if (named) return named;
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return digit[1];
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  return code;
}

/**
 * The face an operator reads. Label and listener come from one declaration by
 * construction — a stale shortcut hint teaches a chord that does something
 * else, which is worse than no hint at all (the ruling behind
 * `CLIPBOARD_HISTORY_HOTKEY_LABEL`, generalized).
 */
export function formatChord(chord: Chord, apple: boolean = isApplePlatform()): string {
  const parts: string[] = [];
  if (chord.mod) parts.push(apple ? '⌘' : 'Ctrl');
  if (chord.meta) parts.push(apple ? '⌘' : 'Meta');
  if (chord.ctrl) parts.push('Ctrl');
  if (chord.alt) parts.push(apple ? '⌥' : 'Alt');
  if (chord.shift) parts.push(apple ? '⇧' : 'Shift');
  parts.push(chord.kind === 'letter' ? chord.key.toUpperCase() : codeFace(chord.key));
  return apple ? parts.join('') : parts.join('+');
}

/**
 * Does this event fire this chord?
 *
 * Every modifier is checked in BOTH directions. A predicate that only asserts
 * the modifiers it wants (`if (!e.shiftKey) return;`) fires ⌘⇧V for ⌘⌥⇧V too,
 * which is how a chord quietly steals a neighbouring binding.
 */
export function matchesChord(chord: Chord, event: ChordKeyEvent): boolean {
  if (chord.mod) {
    // `Mod` matches EITHER physical key — but not both at once. `event.metaKey
    // === event.ctrlKey` is true when neither is held and when both are, and
    // Ctrl+⌘+V is a different chord than ⌘V: it must not fire it.
    if (event.metaKey === event.ctrlKey) return false;
  } else {
    if (chord.meta !== event.metaKey) return false;
    if (chord.ctrl !== event.ctrlKey) return false;
  }
  if (chord.alt !== event.altKey) return false;
  if (chord.shift !== event.shiftKey) return false;

  if (chord.kind === 'letter') return event.key.toLowerCase() === chord.key;
  return event.code === chord.key;
}

/**
 * Keys that are ONLY a modifier. A `keydown` fires for each of these while the
 * operator is still assembling a chord — holding ⌘ before pressing V delivers a
 * `Meta` keydown first — so a capture surface that treated one as a chord would
 * bind "⌘" and never see the V.
 *
 * `ScrollLock`, `Insert`, `CapsLock`'s neighbours and the F-row are deliberately
 * ABSENT: they are real, bindable keys (the focus-scan reclaim binds `Insert`
 * and `ScrollLock` today), and a scanner cannot type them.
 */
const MODIFIER_ONLY_KEYS: ReadonlySet<string> = new Set([
  'Shift',
  'Control',
  'Alt',
  'AltGraph',
  'Meta',
  'OS',
  'CapsLock',
  'Hyper',
  'Super',
  'Fn',
  'FnLock',
  'Dead',
  'Unidentified',
]);

/**
 * Read a chord off a live `keydown` — the capture half of a rebinding surface.
 *
 * Returns `null` for a keystroke that is not a chord yet: a bare modifier press,
 * or an event carrying neither a usable `code` nor a letter.
 *
 * ## Three decisions live here, and each of them is a bug somewhere else
 *
 * 1. **`Mod` is INFERRED, not spelled.** Exactly one of ⌘/Ctrl held becomes
 *    `mod: true`, which is what {@link matchesChord} requires and what makes a
 *    chord captured on a macOS bench fire on the Windows terminal the same
 *    staffer walks to after lunch. Both held is a different chord (explicit
 *    `meta` + `ctrl`), and it is kept as one.
 *
 * 2. **Alt+letter is captured as a physical `code`, not a letter.** On macOS,
 *    ⌥P delivers `key: 'π'`. A letter chord matches on `key.toLowerCase()`, so
 *    `{ kind: 'letter', key: 'p' }` would never fire under ⌥ on an Apple bench —
 *    and `{ kind: 'letter', key: 'π' }` does not survive {@link parseChord}, so
 *    it could not be persisted either. `{ kind: 'code', key: 'KeyP' }` fires on
 *    both platforms and round-trips. The layout-independence argument for
 *    matching letters on `key` still holds for every chord WITHOUT ⌥, which is
 *    all of them by default.
 *
 * 3. **Everything non-letter reads `code`.** Shift+1 delivers `key: '!'`; a
 *    chord keyed on that stops matching the moment the modifier changes. This is
 *    the same rule the module header states, applied to capture.
 */
export function chordFromEvent(event: ChordKeyEvent): Chord | null {
  if (MODIFIER_ONLY_KEYS.has(event.key)) return null;

  // Exactly one of ⌘/Ctrl is the portable `Mod`; both together is a real,
  // distinct chord that `matchesChord` refuses to fold into `Mod`.
  const bothPrimaries = event.metaKey && event.ctrlKey;
  const mod = event.metaKey !== event.ctrlKey;
  const modifiers = {
    mod,
    meta: bothPrimaries ? true : false,
    ctrl: bothPrimaries ? true : false,
    alt: event.altKey,
    shift: event.shiftKey,
  } as const;

  const letterCode = /^Key([A-Z])$/.exec(event.code);
  if (letterCode && !event.altKey) {
    return { key: letterCode[1].toLowerCase(), kind: 'letter', ...modifiers };
  }
  if (event.code) return { key: event.code, kind: 'code', ...modifiers };

  // No `code` at all — an on-screen keyboard, an IME, a synthetic event. The
  // character is the only thing left to go on.
  const character = event.key.toLowerCase();
  if (/^[a-z]$/.test(character)) return { key: character, kind: 'letter', ...modifiers };
  return null;
}

/**
 * The canonical spec string for a chord — the durable form, and the inverse of
 * {@link parseChord}: `parseChord(chordToSpec(c))` is `c` for every chord
 * `parseChord` or {@link chordFromEvent} can produce.
 *
 * This is what lands in `staff_preferences.prefs.workspace.keybindings`, so it
 * is deliberately ASCII and modifier-ordered — never {@link formatChord}'s
 * output, which is platform-dependent (⌘ on one bench, `Ctrl` on the next) and
 * would persist one operator's platform into another's prefs row.
 */
export function chordToSpec(chord: Chord): string {
  const parts: string[] = [];
  if (chord.mod) parts.push('Mod');
  if (chord.meta) parts.push('Meta');
  if (chord.ctrl) parts.push('Ctrl');
  if (chord.alt) parts.push('Alt');
  if (chord.shift) parts.push('Shift');
  parts.push(chord.kind === 'letter' ? chord.key.toUpperCase() : chord.key);
  return parts.join('+');
}
