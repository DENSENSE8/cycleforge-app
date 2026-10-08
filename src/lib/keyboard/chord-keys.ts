'use client';

/**
 * Chord faces — a declared chord (`mod+shift+o`, `alt+1`) as the keycaps a
 * `KeyboardKey` row paints, per platform: `mod` is ⌘ on Apple, Ctrl
 * elsewhere; `alt` is ⌥ / Alt; `shift` is ⇧ / Shift. Keys paint uppercase.
 */

import { useSyncExternalStore } from 'react';

const APPLE: Readonly<Record<string, string>> = { mod: '⌘', shift: '⇧', alt: '⌥' };
const OTHER: Readonly<Record<string, string>> = { mod: 'Ctrl', shift: 'Shift', alt: 'Alt' };

export function chordKeys(chord: string, apple: boolean): string[] {
  const names = apple ? APPLE : OTHER;
  return chord
    .split('+')
    .filter(Boolean)
    .map((part) => names[part.toLowerCase()] ?? part.toUpperCase());
}

/**
 * ⌥1…⌥9, ⌥0 → slot 0…9, else null. Reads `code`, not `key`: on macOS ⌥1
 * types `¡`. Any other modifier (⌘, Ctrl, ⇧) is a different chord.
 */
export function altDigitSlot(event: Pick<KeyboardEvent, 'altKey' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'code'>): number | null {
  if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return null;
  const match = /^Digit([0-9])$/.exec(event.code);
  if (!match) return null;
  const digit = Number(match[1]);
  return digit === 0 ? 9 : digit - 1;
}

/** The chord that opens `slot` (0…9): `alt+1` … `alt+9`, `alt+0`. */
export function altDigitChord(slot: number): string {
  return `alt+${(slot + 1) % 10}`;
}

/** The device's keyboard family, read once — `navigator` never changes under a page. */
let appleCache: boolean | null = null;
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return true;
  if (appleCache == null) {
    const uaPlatform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform;
    appleCache = uaPlatform === 'macOS' || /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
  }
  return appleCache;
}

const noSubscribe = () => () => {};

/** Apple keyboard? `true` on the server (SSR paints ⌘), the device's answer once hydrated. */
export function useApplePlatform(): boolean {
  return useSyncExternalStore(noSubscribe, isApplePlatform, () => true);
}

/**
 * One keycap's face on THIS device. A chord is authored platform-neutral
 * (`mod`, `Shift`, `Alt`) and each cap names the key this keyboard has —
 * ⌘ on Apple, Ctrl elsewhere; ⇧ / Shift; ⌥ / Alt. Never both in one cap:
 * the legacy `⌘/Ctrl` spelling resolves the same way. Any other key paints
 * as written (a literal `Ctrl` is the Control key on every keyboard).
 */
const MOD_TOKENS = new Set(['mod', '⌘/ctrl', 'cmd/ctrl', 'ctrl/⌘', 'ctrl/cmd']);
const SHIFT_TOKENS = new Set(['shift', '⇧']);
const ALT_TOKENS = new Set(['alt', '⌥', 'option']);
export function platformKeyFace(key: string, apple: boolean): string {
  const token = key.trim().toLowerCase().replace(/\s+/g, '');
  if (MOD_TOKENS.has(token)) return apple ? '⌘' : 'Ctrl';
  if (SHIFT_TOKENS.has(token)) return apple ? '⇧' : 'Shift';
  if (ALT_TOKENS.has(token)) return apple ? '⌥' : 'Alt';
  if (token === 'backspace') return apple ? '⌫' : 'Backspace';
  return key;
}
