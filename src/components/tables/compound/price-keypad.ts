/** Digit / decimal / backspace grammar for the inline price keypad. */

export const PRICE_KEYPAD_KEYS = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '.',
  '0',
  'back',
] as const;

export type PriceKeypadKey = (typeof PRICE_KEYPAD_KEYS)[number];

export function isPriceKeypadKey(key: string): key is PriceKeypadKey {
  return (PRICE_KEYPAD_KEYS as readonly string[]).includes(key);
}

export function applyPriceKey(
  draft: string,
  key: PriceKeypadKey,
  opts: { decimals: number; replace?: boolean },
): string {
  if (key === 'back') return draft.slice(0, -1);

  if (opts.replace) {
    if (key === '.') return '0.';
    return key;
  }

  if (key === '.') {
    if (draft.includes('.')) return draft;
    return draft.length === 0 ? '0.' : `${draft}.`;
  }

  if (!draft.includes('.') && draft === '0') return key;

  const frac = draft.split('.')[1];
  if (frac != null && frac.length >= opts.decimals) return draft;

  return `${draft}${key}`;
}

export function priceKeyFromKeyboard(eventKey: string): PriceKeypadKey | null {
  if (eventKey === 'Backspace') return 'back';
  if (eventKey === '.' || eventKey === ',') return '.';
  if (/^[0-9]$/.test(eventKey)) return eventKey as PriceKeypadKey;
  return null;
}
