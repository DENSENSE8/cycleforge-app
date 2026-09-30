/**
 * The app-wide key law (owner 2026-09-30: "Ensure the keybinds do not
 * collide … the C for checklist collides with the add for sales orders and
 * adding in general").
 *
 * A few letters are RESERVED on every page: they arm an app-wide sequence
 * (`C` then a letter adds, `G` then a letter goes, `Y` then a letter syncs)
 * or open help (`?`). A reserved letter means its verb everywhere it
 * appears — bare, or as the letter after a leader (`G C` must not "go to the
 * checklist" when `C` is create). A page may claim bare `C` for its OWN
 * create (the Tasks board's New task — `registerPageCreate`), never for
 * anything else. Copy lives on ⌘/Ctrl+C (`COPY_HOTKEY`) when no text is
 * selected; the native copy wins over a text selection.
 *
 * Pure data + predicates: `key-registry.test.ts` holds every declared key
 * map against {@link reservedKeyViolations}.
 */

export type ReservedVerb = 'create' | 'go' | 'sync' | 'help';

/** Bare letter → the verb it means app-wide. */
export const APP_RESERVED_KEYS: Readonly<Record<string, ReservedVerb>> = {
  c: 'create',
  g: 'go',
  y: 'sync',
  '?': 'help',
};

/** The Add leader (`GlobalHeaderAdd`): `C` then S / I / P / R. */
export const CREATE_LEADER = 'c';
/** The Go leader (`NavGoKeys`): `G` then a lane / page letter. */
export const GO_LEADER = 'g';
/** The Sync leader (`GlobalHeaderSync`): `Y` then A / O / I. */
export const SYNC_LEADER = 'y';

/** Copy the record / selection: ⌘C on Apple, Ctrl+C elsewhere, when no text is selected. */
export const COPY_HOTKEY = 'mod+c';
/** Copy every shown entry (paste ledgers): ⌘⌥C / Ctrl+Alt+C — never Ctrl+Shift+C (DevTools). */
export const COPY_SHOWN_HOTKEY = 'mod+alt+c';

/**
 * A hotkey as written on a verb: a single letter (`'p'`, bare) or a chord
 * (`'mod+c'`, `'mod+alt+c'`; `mod` = ⌘ on Apple, Ctrl elsewhere).
 */
export type Hotkey = string;

type KeyEventLike = Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>;

function chordParts(hotkey: Hotkey): { mod: boolean; alt: boolean; shift: boolean; key: string } {
  const parts = hotkey.trim().toLowerCase().split('+').filter(Boolean);
  const key = parts.at(-1) ?? '';
  const mods = new Set(parts.slice(0, -1));
  return { mod: mods.has('mod'), alt: mods.has('alt'), shift: mods.has('shift'), key };
}

/** Does this keydown press `hotkey`? Letters are case-insensitive; a chord's modifiers must match exactly. */
export function hotkeyMatches(hotkey: Hotkey | undefined, event: KeyEventLike): boolean {
  if (!hotkey?.trim()) return false;
  const want = chordParts(hotkey);
  const mod = event.metaKey || event.ctrlKey;
  if (mod !== want.mod || event.altKey !== want.alt) return false;
  // A bare letter tolerates Shift (caps lock / `X` vs `x` read alike); a chord names it.
  if (want.mod && event.shiftKey !== want.shift) return false;
  // ⌥ rewrites `key` on macOS (⌥C types `ç`): a letter chord reads the physical key.
  const pressed = want.alt && /^Key[A-Z]$/.test(event.code) ? event.code.slice(3).toLowerCase() : event.key.toLowerCase();
  return pressed === want.key;
}

/** The hotkey is a ⌘/Ctrl chord (it must yield to the browser's own copy over a text selection). */
export function isModHotkey(hotkey: Hotkey | undefined): boolean {
  return Boolean(hotkey && chordParts(hotkey).mod);
}

/**
 * {@link hotkeyMatches}, and a ⌘/Ctrl chord stands down while text is
 * selected — ⌘C over a selection is the browser's copy, never the verb's.
 */
export function hotkeyFires(hotkey: Hotkey | undefined, event: KeyEventLike): boolean {
  if (!hotkeyMatches(hotkey, event)) return false;
  return !isModHotkey(hotkey) || typeof window === 'undefined' || !window.getSelection()?.toString();
}

/** A hotkey as keycap faces for `KeyboardKey` (which paints `mod` as ⌘ / Ctrl, `alt` as ⌥ / Alt). */
export function hotkeyKeys(hotkey: Hotkey): string[] {
  return hotkey
    .trim()
    .split('+')
    .filter(Boolean)
    .map((part) => (['mod', 'alt', 'shift'].includes(part.toLowerCase()) ? part.toLowerCase() : part.toUpperCase()));
}

/** A hotkey as one chord string for `KeyboardChord` / a tooltip's `shortcut` (`mod+C`, `P`). */
export function hotkeyChord(hotkey: Hotkey): string {
  return hotkeyKeys(hotkey).join('+');
}

/** `aria-keyshortcuts` for a hotkey: `P`; `mod+c` → `Meta+C Control+C` (either platform's spelling). */
export function hotkeyAriaShortcuts(hotkey: Hotkey): string {
  const keys = hotkeyKeys(hotkey).map((key) => (key === 'alt' ? 'Alt' : key === 'shift' ? 'Shift' : key));
  if (!keys.includes('mod')) return keys.join('+');
  return ['Meta', 'Control'].map((mod) => keys.map((key) => (key === 'mod' ? mod : key)).join('+')).join(' ');
}

/**
 * One declared binding: `keys` is the sequence as typed, space-separated
 * (`'c'`, `'g d'`, `'mod+c'`); `verb` names what it does (`'create'` for any add / new).
 */
export type KeyBinding = { surface: string; keys: string; verb: string };

/**
 * Every binding that uses a reserved letter for a different verb: a bare
 * reserved letter, or a reserved letter anywhere in a sequence (`G C`). A
 * leader's own sequence is its verb (`g d` is go, `c s` is create). Chords
 * are other keys (`mod+c`, `shift+c`): the leaders never arm on a modifier.
 */
export function reservedKeyViolations(bindings: readonly KeyBinding[]): string[] {
  const out: string[] = [];
  for (const { surface, keys, verb } of bindings) {
    for (const step of keys.trim().toLowerCase().split(/\s+/)) {
      const reserved = step.includes('+') ? undefined : APP_RESERVED_KEYS[step];
      if (reserved && reserved !== verb) out.push(`${surface}: ${keys.toUpperCase()} is "${verb}", but ${step.toUpperCase()} means ${reserved} app-wide`);
    }
  }
  return out;
}
