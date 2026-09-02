/**
 * Pin slot chords — ⌘/Ctrl+1–9 from list order.
 * Label and binding share this module so hints cannot drift from
 * PinHotkeysListener on MasterNav.
 */

import { MAX_PIN_HOTKEY_SLOTS } from './types';

/** True when the UI should show ⌘ rather than Ctrl+. */
function isAppleModPlatform(): boolean {
  if (typeof navigator === 'undefined') return true;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
    || /Mac OS|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Display label for pin slot 1…{@link MAX_PIN_HOTKEY_SLOTS}.
 * Returns empty string for out-of-range slots (pins past 9 have no chord).
 */
export function pinHotkeyLabel(slot: number): string {
  if (!Number.isInteger(slot) || slot < 1 || slot > MAX_PIN_HOTKEY_SLOTS) return '';
  const mod = isAppleModPlatform() ? '⌘' : 'Ctrl+';
  return `${mod}${slot}`;
}

/**
 * Resolve a pin slot from a keyboard event, or null if this event is not a
 * pin jump chord. Requires meta|ctrl, rejects shift/alt, Digit/Numpad 1–9.
 */
export function pinSlotFromKeyboardEvent(e: KeyboardEvent): number | null {
  if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return null;
  const match = /^Digit([1-9])$/.exec(e.code) ?? /^Numpad([1-9])$/.exec(e.code);
  if (!match) return null;
  const slot = Number(match[1]);
  if (slot < 1 || slot > MAX_PIN_HOTKEY_SLOTS) return null;
  return slot;
}
