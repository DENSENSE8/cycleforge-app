/**
 * Cents-entry keypad math — Square's Keypad: digits fill from the right, so
 * `1`,`2`,`5`,`0` reads `$12.50` with no decimal key to miss.
 *
 * The glass keys are Square's own: `1`–`9`, `C`, `0`, `+`. `C` clears the
 * amount; `+` is not arithmetic — it commits the amount as a line, so the
 * component owns it and this math never sees it. Backspace stays a
 * physical-keyboard convenience (`back`), with no key on the glass.
 *
 * Callers: `KioskAmountKeypad`.
 */

export const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '+'] as const;
export type KeypadKey = (typeof KEYPAD_KEYS)[number];
/** Everything that changes the amount: a glass key other than `+`, or keyboard Backspace. */
export type KeypadPress = Exclude<KeypadKey, '+'> | 'back';

/** $99,999.99 — well past any counter line, inside the intake route's bound. */
export const KEYPAD_MAX_CENTS = 9_999_999;

export function pressKeypad(cents: number, key: KeypadPress): number {
  const from = Number.isFinite(cents) ? Math.max(0, Math.trunc(cents)) : 0;
  if (key === 'C') return 0;
  if (key === 'back') return Math.floor(from / 10);
  const next = from * 10 + Number(key);
  // A key past the cap is ignored rather than truncating what was typed.
  return next > KEYPAD_MAX_CENTS ? from : next;
}

/** A physical keyboard's key → the keypad input it means, or null. */
export function keypadKeyFromKeyboard(key: string): KeypadKey | 'back' | null {
  if (/^[0-9]$/.test(key)) return key as KeypadKey;
  if (key === 'Backspace') return 'back';
  if (key === 'Delete' || key === 'c' || key === 'C') return 'C';
  if (key === '+' || key === 'Enter') return '+';
  return null;
}
