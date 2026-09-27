'use client';

/**
 * Chord faces — a declared chord (`mod+shift+o`, `alt+1`) as the keycaps a
 * `KeyboardKey` row paints, per platform: `mod` is ⌘ on Apple, Ctrl
 * elsewhere; `alt` is ⌥ / Alt; `shift` is ⇧ / Shift. Keys paint uppercase.
 */

import { useEffect, useState } from 'react';

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

/** Apple keyboard? `true` until mounted (SSR paints ⌘), then the real answer. */
export function useApplePlatform(): boolean {
  const [apple, setApple] = useState(true);
  useEffect(() => {
    setApple(/Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent));
  }, []);
  return apple;
}
